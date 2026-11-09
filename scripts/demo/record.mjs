// record — films the guided tour of the base app for the README: the glass sign-in, the
// dashboard as its data arrives, the reveal in each look, the pointer light, sea glass and the
// assistant, in both skins and both modes.
//
//   npm run build -w @apps/base-app                       # film the built app, not the dev server
//   (cd base-app && SERVE_DIST=true node server/main.ts)  # http://127.0.0.1:8787, dev login, demo data
//   BASE_URL=http://127.0.0.1:8787 node scripts/demo/record.mjs
//   ffmpeg -ss <start> -i demo-out/demo.webm -vf "setpts=PTS/8,fps=30" -c:v libx264 -crf 18 demo.mp4
//
// Slow motion: a machine without a GPU cannot draw the glass skin in real time, so a plain
// screen recording stutters. Here the page runs SLOW times slower than life (default 8): every
// clock it reads (performance.now, Date.now, animation-frame times, timers) is slowed by a
// script that runs before the app, and CSS transitions and animations by Chrome's own playback
// rate. The browser has SLOW times as long to draw each frame of every animation, and the
// recording is sped back up by the same factor afterwards (timeline.json gives the factor and
// where the film starts). Nothing about loading changes, so the app behaves exactly as it does
// for a person.
//
// Each scene is tried on its own, so a moved button costs that scene, not the film. Sign-in uses
// the public dev login. BASE_URL points it at the app, DEMO_OUT at the output folder.
import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { defaultChrome } from '../../packages/ui/scripts/browser.mjs';

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
const OUT = process.env.DEMO_OUT ?? 'demo-out';
const SLOW = Number(process.env.DEMO_SLOW ?? 8);
const WIDTH = 1440;
const HEIGHT = 900;
mkdirSync(OUT, { recursive: true });

/** Runs in the page before any of its own code: every clock it can read goes SLOW times slower. */
function slowClocks(slow) {
  const realNow = performance.now.bind(performance);
  const start = realNow();
  const scaled = (t) => start + (t - start) / slow;
  performance.now = () => scaled(realNow());
  const realDateNow = Date.now;
  const dateStart = realDateNow();
  Date.now = () => dateStart + (realDateNow() - dateStart) / slow;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => raf((t) => callback(scaled(t)));
  const timeout = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...args) => timeout(fn, (Number(ms) || 0) * slow, ...args);
  const interval = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...args) => interval(fn, (Number(ms) || 0) * slow, ...args);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: defaultChrome(),
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
  reducedMotion: 'no-preference',
  recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
});
await context.addInitScript(slowClocks, SLOW);
const page = await context.newPage();
page.setDefaultTimeout(15000 * SLOW);
page.setDefaultNavigationTimeout(60000);
const cdp = await context.newCDPSession(page);

/** CSS transitions and animations go as slow as the clocks (set again after a navigation). */
async function slowAnimations() {
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / SLOW });
}

const opened = Date.now();
const timeline = [];
/** Film seconds: the page's time, which runs SLOW times slower than the recording's. */
const filmTime = () => (Date.now() - opened) / 1000 / SLOW;
/** Let `ms` of the page's time pass. */
const pause = (ms) => page.waitForTimeout(ms * SLOW);

function mark(name) {
  timeline.push({ name, at: filmTime() });
  console.log(`${filmTime().toFixed(1).padStart(6)}s  ${name}`);
}

async function scene(name, run) {
  mark(name);
  try {
    await run();
  } catch (error) {
    console.warn(`  scene "${name}" skipped: ${error instanceof Error ? error.message : error}`);
    const file = `failed-${timeline.length}.png`;
    await page.screenshot({ path: join(OUT, file) }).catch(() => {});
    console.warn(`  page: ${page.url()} (screenshot ${file})`);
  }
}

// ─── the pointer, in page time ───

let pointer = { x: WIDTH * 0.3, y: HEIGHT * 0.4 };
async function moveTo(x, y, ms = 700) {
  const from = pointer;
  const steps = Math.max(1, Math.round(ms / 33));
  for (let i = 1; i <= steps; i++) {
    const q = i / steps;
    const e = q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2; // ease in and out
    pointer = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e };
    await page.mouse.move(pointer.x, pointer.y);
    await pause(33);
  }
}

/** Glide to the element and click it, as a person would. */
async function press(locator) {
  const target = locator.filter({ visible: true }).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box) await moveTo(box.x + box.width / 2, box.y + box.height / 2);
  await target.click();
}

/** A sidebar link by its name. */
const nav = (name) => page.getByRole('navigation').getByRole('link', { name, exact: true });
const button = (name) => page.getByRole('button', { name, exact: true });

/** Sweep the pointer across the first few elements matching a selector. */
async function sweep(selector, count = 4) {
  const items = page.locator(selector);
  const n = Math.min(count, await items.count());
  for (let i = 0; i < n; i++) {
    const box = await items.nth(i).boundingBox();
    if (!box || box.y < 0 || box.y > HEIGHT) continue;
    await moveTo(box.x + box.width * 0.2, box.y + box.height * 0.45, 350);
    await moveTo(box.x + box.width * 0.85, box.y + box.height * 0.6, 650);
  }
}

/** Scroll a heading to the top of the view, smoothly, and let it settle. */
async function scrollToHeading(name) {
  const heading = page.getByRole('heading', { name, exact: true }).first();
  await heading.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await pause(1200);
}

/** Wait for a page's main heading after a route change. */
const arrive = (name) =>
  page.getByRole('heading', { level: 1, name, exact: true }).first().waitFor();

// ─── the tour ───

// the first look is set before anything loads; after that the tour switches skin and mode with
// the app's own controls and moves by the sidebar, so the page never reloads
await context.addCookies([{ name: 'ui-theme', value: 'dark.glass.tide.dark', url: BASE }]);
await page.goto(`${BASE}/`);
await page.evaluate(() => {
  localStorage.setItem('ui-skin', 'glass');
  localStorage.setItem('ui-theme', 'dark');
  localStorage.removeItem('ui:lowpower:lag');
  localStorage.removeItem('ui:seaglass:verdict');
});
await page.reload();
await slowAnimations();
await button('Fill dev login').waitFor();
await page.mouse.move(pointer.x, pointer.y);
await pause(2500); // the sea glass settles before the film starts
mark('start');

await scene('glass sign-in', async () => {
  await moveTo(WIDTH * 0.7, HEIGHT * 0.55, 1600);
  await pause(400);
});

await scene('sign in', async () => {
  await press(button('Fill dev login'));
  await pause(600);
  await press(button('Sign in'));
  await arrive('Overview');
});

if (!(await page.getByRole('heading', { level: 1, name: 'Overview' }).count())) {
  mark('sign in through the API');
  const status = await page.evaluate(
    (body) =>
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.status),
    { email: 'admin@example.test', password: 'adminpassword' },
  );
  console.log(`  status ${status}`);
  await page.goto(`${BASE}/`);
  await slowAnimations();
  await arrive('Overview');
}

await scene('dashboard arrives (frost)', async () => {
  await pause(4200);
});

await scene('pointer light on the figures', async () => {
  await sweep('.ui-kpi-fx');
  await pause(500);
});

await scene('switch to enterprise light', async () => {
  await press(page.getByRole('radio', { name: 'Enterprise' }));
  await pause(1000);
  await press(button('Switch to light mode'));
  await pause(1000);
});

await scene('graphs arrive (plotter)', async () => {
  await press(nav('Graphs'));
  await arrive('Graphs');
  await pause(4800);
});

await scene('the reveal in each look', async () => {
  await press(nav('Kit'));
  await arrive('Kit');
  await pause(800);
  await scrollToHeading('Data visualisation');
  await press(button('Replay'));
  await pause(3400);
  await press(button("With the agent's notes"));
  await pause(4300);
});

await scene('switch to glass dark', async () => {
  await press(page.getByRole('radio', { name: 'Glass' }));
  await pause(1000);
  await press(button('Switch to dark mode'));
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
  await press(nav('Assistant'));
  await arrive('Assistant');
  await pause(800);
  await press(button('Show example conversation'));
  await pause(4600);
});

await scene('glass light', async () => {
  await press(button('Switch to light mode'));
  await pause(700);
  await press(nav('Home'));
  await arrive('Overview');
  await pause(4800);
});

mark('end');
const video = page.video();
await context.close();
await browser.close();
const recorded = video
  ? await video.path()
  : join(OUT, readdirSync(OUT).find((f) => f.endsWith('.webm')) ?? '');
renameSync(recorded, join(OUT, 'demo.webm'));
const start = timeline.find((t) => t.name === 'start')?.at ?? 0;
writeFileSync(
  join(OUT, 'timeline.json'),
  `${JSON.stringify({ slow: SLOW, startSeconds: start * SLOW, scenes: timeline }, null, 2)}\n`,
);
console.log(
  `wrote ${join(OUT, 'demo.webm')} (slowed ${SLOW}x; the film starts ${(start * SLOW).toFixed(1)}s in)`,
);
