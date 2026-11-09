// record — films the guided tour of the base app for the README, frame by frame: the glass
// sign-in, the dashboard as its data arrives, the reveal in each look, the pointer light, sea
// glass and the assistant, in both skins and both modes.
//
//   npm run dev                                           # the app on http://127.0.0.1:5173
//   npx playwright-core install chromium-headless-shell   # once
//   node scripts/demo/record.mjs                          # demo-out/frames/*.jpg, 30 fps
//   ffmpeg -framerate 30 -i demo-out/frames/%05d.jpg -c:v libx264 -crf 18 -pix_fmt yuv420p demo.mp4
//
// Why frame by frame: a machine without a GPU cannot draw the glass skin in real time, so a
// screen recording stutters. chrome-headless-shell can be driven one frame at a time instead
// (HeadlessExperimental.beginFrame with --deterministic-mode): the page's clock moves exactly
// 1/30 s per frame and nothing runs in between, however long a frame takes to draw. Every
// transition, shader and reveal comes out at its true speed, smoothly.
//
// It talks to Chrome over the DevTools protocol directly (Node's WebSocket): Playwright's own
// waiting would hang, since nothing on the page runs until a frame is asked for. Each scene is
// tried on its own, so a moved button costs that scene, not the film. HEADLESS_SHELL points at
// the browser (default: Playwright's install), BASE_URL at the app, DEMO_OUT at the output.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');
const OUT = process.env.DEMO_OUT ?? 'demo-out';
const FRAMES = join(OUT, 'frames');
const WIDTH = 1440;
const HEIGHT = 900;
const FPS = 30;
const STEP = 1000 / FPS;
const PORT = Number(process.env.DEMO_CDP_PORT ?? 9347);

/** Playwright's chrome-headless-shell, newest first. */
function findShell() {
  if (process.env.HEADLESS_SHELL) return process.env.HEADLESS_SHELL;
  const root = join(homedir(), '.cache', 'ms-playwright');
  const builds = existsSync(root)
    ? readdirSync(root)
        .filter((name) => name.startsWith('chromium_headless_shell-'))
        .sort()
        .reverse()
    : [];
  for (const build of builds) {
    for (const folder of readdirSync(join(root, build))) {
      for (const exe of ['chrome-headless-shell', 'headless_shell']) {
        const path = join(root, build, folder, exe);
        if (existsSync(path)) return path;
      }
    }
  }
  throw new Error('no chrome-headless-shell: run `npx playwright-core install chromium-headless-shell`');
}

// ─── the browser and a DevTools connection ───

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
const profile = join(tmpdir(), `demo-profile-${process.pid}`);
const chrome = spawn(
  findShell(),
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--deterministic-mode',
    '--enable-begin-frame-control',
    '--run-all-compositor-stages-before-draw',
    '--disable-threaded-animation',
    '--disable-threaded-scrolling',
    '--disable-checker-imaging',
    '--disable-image-animation-resync',
    '--enable-surface-synchronization',
    '--hide-scrollbars',
    // CI runners (Ubuntu 24.04) refuse Chrome's sandbox to a downloaded build; Playwright drops it too
    '--no-sandbox',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    `--window-size=${WIDTH},${HEIGHT}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
let chromeLog = '';
chrome.stderr.on('data', (chunk) => {
  chromeLog = (chromeLog + chunk).slice(-4000);
});

async function browserSocket() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return (await res.json()).webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`chrome-headless-shell did not open its DevTools port:\n${chromeLog}`);
}

const ws = new WebSocket(await browserSocket());
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = () => reject(new Error('could not open the DevTools socket'));
});
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(String(event.data));
  const waiting = msg.id !== undefined ? pending.get(msg.id) : undefined;
  if (!waiting) return;
  pending.delete(msg.id);
  if (msg.error) waiting.reject(new Error(`${waiting.method}: ${msg.error.message}`));
  else waiting.resolve(msg.result);
};
function cdp(method, params = {}, sessionId) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
}

let ticks = 10_000; // the page's clock, ms
let filmed = 0;
let last = '';
let filming = false;
const timeline = [];

const { targetId } = await cdp('Target.createTarget', {
  url: 'about:blank',
  width: WIDTH,
  height: HEIGHT,
  enableBeginFrameControl: true,
});
const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
/** A call on the page. Some (an evaluate, an input event, a navigation) can only finish once a
    frame is drawn, and nothing is drawn unless asked: while one waits, frames are drawn, unfilmed. */
async function page(method, params) {
  const call = cdp(method, params, sessionId);
  if (method === 'HeadlessExperimental.beginFrame') return call;
  let done = false;
  call.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  for (;;) {
    await Promise.race([call, new Promise((r) => setTimeout(r, 1000))]);
    if (done) return call;
    await frame(false);
  }
}
await page('Page.enable');
await page('Runtime.enable');
await page('Network.enable');
await page('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: false,
});
await page('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: 'dark' }],
});

// ─── frames ───


/** Draw one frame, 1/30 s after the last; keep it when the film is rolling (and `keep`). */
async function frame(keep = true) {
  ticks += STEP;
  const shoot = filming && keep;
  const result = await cdp(
    'HeadlessExperimental.beginFrame',
    {
      frameTimeTicks: ticks,
      interval: STEP,
      ...(shoot ? { screenshot: { format: 'jpeg', quality: 92 } } : {}),
    },
    sessionId,
  );
  if (!shoot) return;
  // a frame with nothing new on screen comes back without an image: repeat the last one
  if (result.screenshotData) last = result.screenshotData;
  if (!last) return;
  filmed += 1;
  writeFileSync(join(FRAMES, `${String(filmed).padStart(5, '0')}.jpg`), Buffer.from(last, 'base64'));
}

/** Let `ms` of the page's time pass. */
async function pause(ms) {
  for (let i = 0; i < Math.round(ms / STEP); i++) await frame();
}

/** Run an expression in the page and return its value. */
async function js(expression) {
  const { result, exceptionDetails } = await page('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'script error');
  return result.value;
}

/** Keep drawing frames until the expression is true, or give up after `ms` of page time. */
async function until(expression, ms = 15000) {
  for (let t = 0; t < ms; t += STEP) {
    if (await js(`Boolean(${expression})`)) return;
    await frame();
  }
  throw new Error(`timed out waiting for ${expression}`);
}

// the page-side finders: an element by its role and its text, whichever is on screen
const FIND = `
  window.__demo = {
    visible: (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; },
    text: (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim(),
    find(selector, name) {
      return [...document.querySelectorAll(selector)].find((el) => this.visible(el) && this.text(el) === name) ?? null;
    },
    box(selector, name) {
      const el = this.find(selector, name);
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
  };`;
const BUTTON = 'button, [role="button"]';
const RADIO = '[role="radio"], [role="tab"], button';
const NAV = 'nav a';
const HEADING = 'h1, h2, h3, h4';
const quote = (s) => JSON.stringify(s);

// ─── the pointer ───

let pointer = { x: WIDTH * 0.3, y: HEIGHT * 0.4 };
async function moveTo(x, y, ms = 700) {
  const from = pointer;
  const n = Math.max(1, Math.round(ms / STEP));
  for (let i = 1; i <= n; i++) {
    const q = i / n;
    const e = q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2; // ease in and out
    pointer = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e };
    await page('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pointer.x, y: pointer.y });
    await frame();
  }
}

/** Glide to the element and click it, as a person would. */
async function press(selector, name) {
  await js(FIND);
  const at = await js(`__demo.box(${quote(selector)}, ${quote(name)})`);
  if (!at) throw new Error(`no ${selector} "${name}" on screen`);
  await moveTo(at.x, at.y);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
    await frame();
  }
}

/** Sweep the pointer across the first few elements matching a selector. */
async function sweep(selector, count = 4) {
  const boxes = await js(
    `[...document.querySelectorAll(${quote(selector)})].slice(0, ${count}).map((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }).filter((b) => b.w > 0 && b.y > 0 && b.y < innerHeight)`,
  );
  for (const b of boxes) {
    await moveTo(b.x + b.w * 0.2, b.y + b.h * 0.45, 350);
    await moveTo(b.x + b.w * 0.85, b.y + b.h * 0.6, 650);
  }
}

/** Scroll a heading to the top of the view, smoothly, and let it settle. */
async function scrollToHeading(name) {
  await js(FIND);
  const found = await js(
    `(() => { const h = __demo.find(${quote(HEADING)}, ${quote(name)}); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); return !!h; })()`,
  );
  if (!found) throw new Error(`no heading "${name}"`);
  await pause(1200);
}

// ─── scenes ───

function mark(name) {
  const at = filmed / FPS;
  timeline.push({ name, at });
  console.log(`${at.toFixed(1).padStart(6)}s  ${name}`);
}

async function scene(name, run) {
  mark(name);
  try {
    await run();
  } catch (error) {
    console.warn(`  scene "${name}" skipped: ${error instanceof Error ? error.message : error}`);
  }
}

const onHome = `document.querySelector('h1')?.textContent?.includes('Overview')`;

// the first look is set before anything loads; after that the tour switches skin and mode with
// the app's own controls and moves by the sidebar, so the page never reloads
await page('Network.setCookie', { name: 'ui-theme', value: 'dark.glass.tide.dark', url: BASE });
await page('Page.navigate', { url: `${BASE}/` });
await until(`document.readyState === 'complete' && document.querySelector('form')`, 60000);
await js(
  `localStorage.setItem('ui-skin', 'glass'); localStorage.setItem('ui-theme', 'dark'); localStorage.removeItem('ui:lowpower:lag'); localStorage.removeItem('ui:seaglass:verdict');`,
);
await pause(2500); // the sea glass settles before the film rolls
await page('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pointer.x, y: pointer.y });
filming = true;

await scene('glass sign-in', async () => {
  await pause(600);
  await moveTo(WIDTH * 0.7, HEIGHT * 0.55, 1600);
  await pause(400);
});

await scene('sign in', async () => {
  await press(BUTTON, 'Fill dev login');
  await pause(600);
  await press(BUTTON, 'Sign in');
  await until(onHome, 20000);
});

if (!(await js(onHome))) {
  mark('sign in through the API');
  filming = false;
  await js(
    `fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', password: 'adminpassword' }) }).then((r) => r.status)`,
  );
  await page('Page.navigate', { url: `${BASE}/` });
  await until(`document.readyState === 'complete'`, 60000);
  filming = true;
  await until(onHome, 30000);
}

await scene('dashboard arrives (frost)', async () => {
  await pause(4200);
});

await scene('pointer light on the figures', async () => {
  await sweep('.ui-kpi-fx');
  await pause(500);
});

await scene('switch to enterprise light', async () => {
  await press(RADIO, 'Enterprise');
  await pause(1000);
  await press(BUTTON, 'Switch to light mode');
  await pause(1000);
});

await scene('graphs arrive (plotter)', async () => {
  await press(NAV, 'Graphs');
  await pause(4800);
});

await scene('the reveal in each look', async () => {
  await press(NAV, 'Kit');
  await pause(1200);
  await scrollToHeading('Data visualisation');
  await press(BUTTON, 'Replay');
  await pause(3400);
  await press(BUTTON, "With the agent's notes");
  await pause(4300);
});

await scene('switch to glass dark', async () => {
  await press(RADIO, 'Glass');
  await pause(1000);
  await press(BUTTON, 'Switch to dark mode');
  await pause(1300);
});

await scene('cards and tiles', async () => {
  await scrollToHeading('Cards and tiles');
  await sweep('.ui-kpi-fx', 3);
  await pause(600);
});

await scene('sea glass', async () => {
  await scrollToHeading('Sea glass');
  await moveTo(WIDTH * 0.4, HEIGHT * 0.55, 900);
  await moveTo(WIDTH * 0.62, HEIGHT * 0.45, 1300);
  await pause(1500);
});

await scene('the assistant (draft)', async () => {
  await press(NAV, 'Assistant');
  await pause(1000);
  await press(BUTTON, 'Show example conversation');
  await pause(4600);
});

await scene('glass light', async () => {
  await press(BUTTON, 'Switch to light mode');
  await pause(700);
  await press(NAV, 'Home');
  await pause(4800);
});

mark('end');
writeFileSync(join(OUT, 'timeline.json'), `${JSON.stringify(timeline, null, 2)}\n`);
console.log(`wrote ${filmed} frames (${(filmed / FPS).toFixed(1)}s) to ${FRAMES}`);
ws.close();
chrome.kill();
rmSync(profile, { recursive: true, force: true });
