// browser — the headless Chrome the kit's browser checks drive (a11y-check, touch-targets and
// base-app's a11y-browser, backdrop-contrast and perf-glass), on playwright-core. It offers the
// small surface those scripts were written against: `localBrowser.launch(options)`,
// `Stagehand.create({ browser })` whose `browser.context` has `pages()` and `newPage()`, and
// tabs with `goto`, `waitForLoadState`, `waitForTimeout`, `evaluate`, `screenshot` and
// `setViewportSize(width, height)`. No model is ever called.
//
// Chrome: CHROME_PATH if set, else Google Chrome or Chromium where they usually live, else
// playwright's own browser (`npx playwright-core install chromium`). The same file is mirrored
// in base-app/scripts/browser.mjs (and back), so an exported app carries its own copy.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

/** The Chrome to launch, or undefined for playwright's own. */
export function defaultChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return CANDIDATES.find((path) => existsSync(path));
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
      DevTools protocol on that port (perf-glass reads compositor frames through it). */
  async launch({
    headless = true,
    executablePath,
    viewport,
    deviceScaleFactor,
    hasTouch,
    args = [],
    port,
  } = {}) {
    const browser = await chromium.launch({
      headless,
      executablePath,
      args: [...args, ...(port ? [`--remote-debugging-port=${port}`] : [])],
    });
    const context = await browser.newContext({
      viewport: viewport ?? null,
      deviceScaleFactor,
      hasTouch,
    });
    return { browser, context, close: () => browser.close() };
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
