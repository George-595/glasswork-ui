// browser — the headless Chrome the kit's browser checks drive (a11y-check, touch-targets and
// base-app's a11y-browser, backdrop-contrast and perf-glass), on playwright-core. It offers the
// small surface those scripts were written against: `localBrowser.launch(options)`,
// `Stagehand.create({ browser })` whose `browser.context` has `pages()` and `newPage()`, and
// tabs with `goto`, `waitForLoadState`, `waitForTimeout`, `evaluate`, `screenshot` and
// `setViewportSize(width, height)`. No model is ever called.
//
// Browser: CHROME_PATH if set, else playwright's own chromium-headless-shell (`npm run browsers`; it is not a
// signed .app, so it leaves no code_sign_clone behind on macOS), else Google Chrome or Chromium where they
// usually live, else playwright's own browser. When the real Chrome is used, `close()` removes the clone folders
// that launch left (chrome-clones.mjs). The same file is mirrored in base-app/scripts/browser.mjs and
// packages/ui/scripts/browser.mjs (with chrome-clones.mjs), so an exported app carries its own copy.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { guardClones, headlessShell } from './chrome-clones.mjs';

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

/** The browser to launch, or undefined for playwright's own. */
export function defaultChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return headlessShell() ?? CANDIDATES.find((path) => existsSync(path));
}

/** For checks that need a full Chrome (WebAuthn, service workers, push: the headless shell has no
    `navigator.credentials`): CHROME_PATH, else the installed Chrome or Chromium, never the headless shell. */
export function fullChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return CANDIDATES.find((path) => existsSync(path));
}

/** Which kind of browser an executable is, for a gate to say what it ran on. */
export function browserKind(exe) {
  return !exe
    ? "playwright's own browser"
    : /headless[-_]shell/.test(exe)
      ? 'headless shell'
      : 'Chrome';
}

/** A tab whose setViewportSize takes (width, height), as the scripts call it. */
function tabOf(page) {
  return new Proxy(page, {
    get(target, key) {
      if (key === 'setViewportSize') {
        return (width, height) =>
          typeof width === 'object'
            ? target.setViewportSize(width)
            : target.setViewportSize({ width, height });
      }
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export const localBrowser = {
  /** Launch Chrome with one context sized and touch-enabled as asked. `port` opens the
      DevTools protocol on that port (perf-glass reads compositor frames through it).
      `guardOptions` is for tests: it is passed to guardClones (chrome-clones.mjs). */
  async launch({
    headless = true,
    executablePath,
    viewport,
    deviceScaleFactor,
    hasTouch,
    args = [],
    port,
    serviceWorkers,
    guardOptions,
  } = {}) {
    const guard = guardClones(guardOptions);
    let browser;
    try {
      browser = await chromium.launch({
        headless,
        executablePath,
        args: [...args, ...(port ? [`--remote-debugging-port=${port}`] : [])],
      });
      const context = await browser.newContext({
        viewport: viewport ?? null,
        deviceScaleFactor,
        hasTouch,
        ...(serviceWorkers ? { serviceWorkers } : {}),
      });
      return {
        browser,
        context,
        close: () => guard.around(() => browser.close()),
      };
    } catch (err) {
      // a launch that failed part-way: close what started (if anything), sweep what it left, then rethrow
      await guard.around(async () => browser?.close()).catch(() => {});
      throw err;
    }
  },
};

export const Stagehand = {
  /** Wraps a launched browser in the shape the scripts use; `model` and `logging` are ignored. */
  async create({ browser }) {
    const { context } = browser;
    return {
      browser: {
        context: {
          pages: async () => context.pages().map(tabOf),
          newPage: async () => tabOf(await context.newPage()),
        },
      },
      close: async () => {},
    };
  },
};
