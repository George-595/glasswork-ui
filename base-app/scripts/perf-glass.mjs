// perf-glass — the glass skin's performance guard rail, on a phone profile.
//
//   npm run dev                       # in one terminal
//   npm run check:perf:glass          # in another (local only, like check:a11y:browser)
//
// Glass was laggy on phones (George, Oct 2026). The causes were a background that redrew 60
// times a second under every backdrop filter, SVG refraction on scrolling content, a blur on
// dozens of small controls and a reveal canvas per card. This script keeps them fixed: it opens
// the signed-in app in headless Chrome as a 390x844 touch phone at DPR 3 with
// the CPU throttled 4x (CDP Emulation.setCPUThrottlingRate), in the glass skin, and asserts for
// Home and the table, after 6 seconds at rest:
//
//   - 0 composited frames and 0 page requestAnimationFrame callbacks per second at idle;
//   - at most 3 backdrop-filter elements, none of them an SVG `url(` filter (a phone never
//     refracts);
//   - the long animation frames of a tap on the theme button total under 300 ms (the table's
//     own re-render is about 190 ms at x4 in either skin; glass used to add 1.7 s of maps);
//   - the first scroll through the page has a p90 frame interval under 20 ms.
//
// Limits are the PERF_* environment variables below. The GPU itself cannot be throttled, so
// the composited-frame count (a trace of DrawFrame events) is the signal, not milliseconds of
// GPU time. Exits 1 on any miss. BASE_URL points it at another server. The browser is
// scripts/browser.mjs (playwright-core).
import { defaultChrome, localBrowser, Stagehand } from './browser.mjs';

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');
const EMAIL = process.env.A11Y_EMAIL ?? 'admin@example.test';
const PASSWORD = process.env.A11Y_PASSWORD ?? 'adminpassword';
const CDP_PORT = Number(process.env.PERF_CDP_PORT ?? 9341);
const CPU_RATE = Number(process.env.PERF_CPU_RATE ?? 4);
const MAX_BACKDROP_FILTERS = Number(process.env.PERF_MAX_BACKDROP_FILTERS ?? 3);
const MAX_THEME_LOAF_MS = Number(process.env.PERF_MAX_THEME_LOAF_MS ?? 300);
const MAX_SCROLL_P90_MS = Number(process.env.PERF_MAX_SCROLL_P90_MS ?? 20);
const SETTLE_MS = 6000;
const IDLE_MS = 2500;
const ROUTES = ['/', '/table'];


/** A minimal CDP client over the browser's debugging port (Stagehand has no raw CDP call). */
async function cdpClient(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const target = targets.find((t) => t.type === 'page');
  if (!target) throw new Error('no page target on the debugging port');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('could not open the CDP socket'));
  });
  let id = 0;
  const waiting = new Map();
  const listeners = new Set();
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && waiting.has(data.id)) {
      const { resolve, reject } = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error) reject(new Error(`${data.error.message}`));
      else resolve(data.result);
    } else if (data.method) for (const fn of listeners) fn(data);
  };
  return {
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const n = ++id;
        waiting.set(n, { resolve, reject });
        ws.send(JSON.stringify({ id: n, method, params }));
      }),
    on: (fn) => listeners.add(fn),
    off: (fn) => listeners.delete(fn),
    close: () => ws.close(),
  };
}

/** Count the frames the compositor drew while `run` executes. */
async function compositedFrames(cdp, run) {
  let frames = 0;
  const onEvent = (data) => {
    if (data.method === 'Tracing.dataCollected') {
      for (const e of data.params.value) if (e.name === 'DrawFrame') frames++;
    }
  };
  cdp.on(onEvent);
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,disabled-by-default-devtools.timeline.frame',
    transferMode: 'ReportEvents',
  });
  await run();
  const done = new Promise((resolve) => {
    const fn = (data) => {
      if (data.method === 'Tracing.tracingComplete') {
        cdp.off(fn);
        resolve();
      }
    };
    cdp.on(fn);
  });
  await cdp.send('Tracing.end');
  await done;
  cdp.off(onEvent);
  return frames;
}

const CENSUS = `(() => {
  let n = 0;
  let svg = 0;
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const bf = cs.backdropFilter || cs.webkitBackdropFilter;
    if (!bf || bf === 'none') continue;
    n++;
    if (bf.includes('url(')) svg++;
  }
  return { filters: n, svg, coarse: matchMedia('(pointer: coarse)').matches,
    skin: document.documentElement.dataset.skin, power: document.documentElement.dataset.power || null };
})()`;

const IDLE_RAF = (ms) => `new Promise((resolve) => {
  const orig = window.requestAnimationFrame;
  let calls = 0;
  window.requestAnimationFrame = function (cb) { calls++; return orig.call(window, cb); };
  setTimeout(() => { window.requestAnimationFrame = orig; resolve(calls / (${ms} / 1000)); }, ${ms});
})`;

const THEME_LOAF = `(async () => {
  let total = 0;
  const observer = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) total += e.duration;
  });
  observer.observe({ type: 'long-animation-frame', buffered: false });
  // the app's own theme button, so the React re-render and any map regeneration are counted,
  // not just the restyle a bare data-theme flip would cost
  const button = () =>
    [...document.querySelectorAll('button[aria-label]')].find((b) =>
      /^Switch to (dark|light) mode$/.test(b.getAttribute('aria-label')),
    );
  const root = document.documentElement;
  const first = button();
  if (first) first.click();
  else root.setAttribute('data-theme', root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  await new Promise((r) => setTimeout(r, 1500));
  observer.disconnect();
  const back = button();
  if (first && back) back.click();
  else root.setAttribute('data-theme', 'light');
  await new Promise((r) => setTimeout(r, 500));
  return Math.round(total);
})()`;

const SCROLL_P90 = `(async () => {
  const intervals = [];
  let last = performance.now();
  const top = document.scrollingElement;
  const max = top.scrollHeight - innerHeight;
  const target = Math.min(1800, max);
  const steps = 40;
  for (let i = 1; i <= steps; i++) {
    top.scrollTop = (target * i) / steps;
    await new Promise((r) => requestAnimationFrame(r));
    const now = performance.now();
    intervals.push(now - last);
    last = now;
  }
  intervals.sort((a, b) => a - b);
  return { p90: Math.round(intervals[Math.floor(intervals.length * 0.9)] * 10) / 10, scrolled: Math.round(target) };
})()`;

let failures = 0;
const rows = [];
function check(route, name, value, ok, limit) {
  if (!ok) failures++;
  rows.push(
    `${ok ? 'ok  ' : 'FAIL'} ${route.padEnd(7)} ${name.padEnd(34)} ${String(value).padStart(8)}  (${limit})`,
  );
}

const exe = defaultChrome();
const browser = await localBrowser.launch({
  headless: true,
  port: CDP_PORT,
  ...(exe ? { executablePath: exe } : {}),
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
});
const sh = await Stagehand.create({
  browser,
  model: {
    generate: async () => {
      throw new Error('no model in perf-glass');
    },
  },
  logging: { level: 'off', format: 'json' },
});
let cdp;
try {
  const tab = (await sh.browser.context.pages())[0] ?? (await sh.browser.context.newPage());
  cdp = await cdpClient(CDP_PORT);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });

  await tab.goto(`${BASE}/`);
  const status = await tab.evaluate(`fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(${JSON.stringify({ email: EMAIL, password: PASSWORD })}),
  }).then((r) => r.status)`);
  if (status !== 200) throw new Error(`sign-in failed: HTTP ${status}`);
  await tab.evaluate(
    `localStorage.setItem('ui-skin', 'glass'); localStorage.setItem('ui-theme', 'light'); document.cookie = 'ui-theme=light.glass.tide.light; Path=/'; localStorage.removeItem('ui:lowpower:lag'); localStorage.removeItem('ui:seaglass:verdict');`,
  );

  for (const route of ROUTES) {
    await tab.goto(`${BASE}${route}`);
    await tab.waitForLoadState('load');
    await tab.waitForTimeout(SETTLE_MS);
    const census = await tab.evaluate(CENSUS);
    if (route === ROUTES[0]) {
      check(
        route,
        'touch pointer emulated (coarse)',
        census.coarse,
        census.coarse === true,
        'must be true',
      );
      check(route, 'glass skin on', census.skin, census.skin === 'glass', 'must be glass');
    }
    check(
      route,
      'backdrop-filter elements',
      census.filters,
      census.filters <= MAX_BACKDROP_FILTERS,
      `<= ${MAX_BACKDROP_FILTERS}`,
    );
    check(route, 'SVG url() backdrop filters', census.svg, census.svg === 0, 'must be 0');

    let raf = 0;
    const frames = await compositedFrames(cdp, async () => {
      raf = await tab.evaluate(IDLE_RAF(IDLE_MS));
    });
    check(route, 'idle page rAF callbacks / s', raf.toFixed(1), raf === 0, 'must be 0');
    check(route, `idle composited frames / ${IDLE_MS / 1000}s`, frames, frames === 0, 'must be 0');

    const loaf = await tab.evaluate(THEME_LOAF);
    check(
      route,
      'theme toggle LoAF total (ms)',
      loaf,
      loaf < MAX_THEME_LOAF_MS,
      `< ${MAX_THEME_LOAF_MS}`,
    );

    // the first scroll: a fresh load, so the page's reveals and lazy work have not played yet
    await tab.goto(`${BASE}${route}`);
    await tab.waitForLoadState('load');
    await tab.waitForTimeout(1500);
    const scroll = await tab.evaluate(SCROLL_P90);
    check(
      route,
      'first-scroll frame p90 (ms)',
      scroll.p90,
      scroll.p90 < MAX_SCROLL_P90_MS,
      `< ${MAX_SCROLL_P90_MS}`,
    );
  }
} finally {
  cdp?.close();
  await sh.close().catch(() => {});
  await browser.close?.().catch?.(() => {});
}

console.log(`glass performance on a 390x844 touch phone, DPR 3, CPU x${CPU_RATE}\n`);
for (const row of rows) console.log(row);
console.log(
  failures
    ? `\n${failures} performance check(s) FAILED`
    : `\nglass performance guard rail passed: ${rows.length} checks`,
);
process.exit(failures ? 1 : 0);
