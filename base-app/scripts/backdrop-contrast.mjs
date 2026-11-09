// backdrop-contrast — the check axe cannot do: text that sits straight on the
// ANIMATED backdrop (no card or glass surface under it), measured against the
// real pixels behind it over many frames, in the glass skin.
//
//   A11Y_PASSWORD=… node scripts/backdrop-contrast.mjs     (with `npm run dev` running)
//
// For each route × mode: finds every visible text element with no opaque or
// frosted surface beneath it, takes FRAMES screenshots over SPAN_MS, and for
// each element computes the WCAG contrast between its text colour and the
// background pixels in its box, shot with every glyph made transparent (the
// 5% of pixels nearest the text colour: the worst case). Reports the worst frame. Exits 1 if any falls below 4.5:1
// (3:1 for large text). Pure Node: PNGs are decoded with zlib, no dependency.
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { defaultChrome, localBrowser, Stagehand } from './browser.mjs';

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');
// the fixed development login (server/config/env.ts); override for other servers
const EMAIL = process.env.A11Y_EMAIL ?? 'admin@example.test';
const PASSWORD = process.env.A11Y_PASSWORD ?? 'adminpassword';
const FRAMES = Number(process.env.FRAMES ?? 8);
const SPAN_MS = Number(process.env.SPAN_MS ?? 8000);
const ROUTES = (
  process.env.ROUTES ?? '/,/table,/tool-1,/graphs,/admin/users,/admin/settings,/admin/audit-log'
).split(',');
const MODES = (process.env.MODES ?? 'light,dark').split(',');

// ---- PNG decode (8-bit RGB/RGBA, non-interlaced: what Chrome produces) ----
function decodePng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, channels, data: out };
}

const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

// ---- browser ----
const exe = defaultChrome();
const browser = await localBrowser.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : {}),
  viewport: { width: 1280, height: 900 },
});
const sh = await Stagehand.create({
  browser,
  model: {
    generate: async () => {
      throw new Error('no model');
    },
  },
  logging: { level: 'off', format: 'json' },
});

// In the page: text elements with nothing opaque or frosted beneath them.
const FIND = `(() => {
  const backed = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (n.classList.contains('ui-app')) return false;
      const bg = cs.backgroundColor.match(/[\\d.]+/g);
      const alpha = bg ? (bg.length > 3 ? Number(bg[3]) : 1) : 0;
      const frosted = (cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none');
      if (alpha >= 0.5 || frosted || cs.backgroundImage !== 'none') {
        if (window.__why) window.__why.push((el.textContent || '').trim().slice(0, 24) + ' <- ' + n.tagName.toLowerCase() + '.' + String(n.className).slice(0, 60) + ' a=' + alpha + ' f=' + frosted + ' img=' + (cs.backgroundImage !== 'none'));
        return true;
      }
    }
    return false;
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0' || el.closest('[aria-hidden="true"]')) continue;
    // the box of the text itself: a block element's own box can run the full column
    // width, over backdrop far from any glyph
    let r = null;
    for (const c of el.childNodes) {
      if (c.nodeType !== 3 || !c.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(c);
      const b = range.getBoundingClientRect();
      r = r
        ? (() => {
            const left = Math.min(r.left, b.left), top = Math.min(r.top, b.top);
            const right = Math.max(r.right, b.right), bottom = Math.max(r.bottom, b.bottom);
            return { left, top, right, bottom, width: right - left, height: bottom - top };
          })()
        : b;
    }
    if (!r || r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
    if (backed(el)) continue;
    const px = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    out.push({
      text: el.textContent.trim().slice(0, 40),
      tag: el.tagName.toLowerCase(),
      color: cs.color,
      large: px >= 24 || (bold && px >= 18.66),
      x: Math.max(0, Math.floor(r.left)), y: Math.max(0, Math.floor(r.top)),
      w: Math.ceil(r.width), h: Math.ceil(r.height),
    });
  }
  return JSON.stringify({ dpr: devicePixelRatio, items: out, why: (window.__why || []).slice(0, 12) });
})()`;

let failures = 0;
try {
  const tab = (await sh.browser.context.pages())[0] ?? (await sh.browser.context.newPage());
  await tab.goto(`${BASE}/`);
  await tab.waitForLoadState('load');
  const status = await tab.evaluate(
    `fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(${JSON.stringify({ email: EMAIL, password: PASSWORD })}) }).then((r) => r.status)`,
  );
  if (status !== 200) throw new Error(`sign-in failed: ${status}`);

  for (const mode of MODES) {
    for (const route of ROUTES) {
      await tab.evaluate(
        `localStorage.setItem('ui-skin','glass'); localStorage.setItem('ui-theme',${JSON.stringify(mode)}); document.cookie = ${JSON.stringify(`ui-theme=${mode}.glass.tide.${mode}; Path=/`)}`,
      );
      // a full page load, so the sign-in and the stored skin and mode (the cookie the server
      // renders from, and localStorage) take effect
      await tab.goto(`${BASE}${route}`);
      await tab.waitForLoadState('load');
      await new Promise((r) => setTimeout(r, 2500)); // data, fonts, backdrop fade-in
      if (process.env.DEBUG) await tab.evaluate('window.__why = []');
      const h1 = await tab.evaluate(`document.querySelector('main h1')?.textContent ?? ''`);
      if (h1 === 'Sign in' || h1 === '')
        throw new Error(`${route} did not render signed in (h1 "${h1}")`);
      const { dpr, items, why } = JSON.parse(await tab.evaluate(FIND));
      if (process.env.DEBUG) console.log(why.join('\n'));
      const worst = items.map((it) => ({ ...it, min: Infinity }));
      // Text colours are read above; now hide every glyph, so each pixel left in a text box
      // is the real background (anti-aliased glyph edges would otherwise pass for backdrop).
      await tab.evaluate(`(() => {
        const s = document.createElement('style');
        s.textContent = '*, *::before, *::after { color: transparent !important; text-shadow: none !important; -webkit-text-fill-color: transparent !important; transition: none !important; }';
        document.head.append(s);
      })()`);
      await new Promise((r) => setTimeout(r, 200));
      if (process.env.DEBUG) {
        const { writeFileSync } = await import('node:fs');
        const shot = `${process.env.DEBUG_DIR ?? '.'}/backdrop-${mode}-${ROUTES.indexOf(route)}.png`;
        writeFileSync(shot, Buffer.from(await tab.screenshot({ type: 'png' })));
      }
      for (let f = 0; f < FRAMES; f++) {
        const png = decodePng(Buffer.from(await tab.screenshot({ type: 'png' })));
        for (const it of worst) {
          const m = it.color.match(/[\d.]+/g).map(Number);
          const tl = lum(m[0], m[1], m[2]);
          const lums = [];
          const x0 = Math.floor(it.x * dpr);
          const y0 = Math.floor(it.y * dpr);
          for (let y = y0; y < Math.min(png.height, y0 + it.h * dpr); y += 2) {
            for (let x = x0; x < Math.min(png.width, x0 + it.w * dpr); x += 2) {
              const i = (y * png.width + x) * png.channels;
              const r = png.data[i];
              const g = png.data[i + 1];
              const b = png.data[i + 2];
              lums.push(lum(r, g, b));
            }
          }
          if (lums.length < 20) continue;
          lums.sort((a, b) => a - b);
          // the background nearest to the text colour is the worst case: take its 5th percentile
          const pick =
            tl < 0.2 ? lums[Math.floor(lums.length * 0.05)] : lums[Math.floor(lums.length * 0.95)];
          it.min = Math.min(it.min, ratio(tl, pick));
        }
        await new Promise((r) => setTimeout(r, SPAN_MS / FRAMES));
      }
      const bad = worst.filter((it) => it.min < (it.large ? 3 : 4.5));
      failures += bad.length;
      const lowest = worst.filter((it) => Number.isFinite(it.min)).sort((a, b) => a.min - b.min)[0];
      console.log(
        `${bad.length ? 'FAIL' : 'ok  '} glass ${mode.padEnd(5)} ${route.padEnd(18)} ${String(worst.length).padStart(3)} text runs on the backdrop` +
          (lowest ? `, lowest ${lowest.min.toFixed(2)}:1 "${lowest.text}"` : ''),
      );
      for (const it of bad)
        console.log(`       ${it.min.toFixed(2)}:1 <${it.tag}> "${it.text}" ${it.color}`);
    }
  }
} finally {
  await sh.close().catch(() => {});
  await browser.close?.().catch?.(() => {});
}
console.log(
  failures
    ? `\n${failures} text run(s) under AA on the animated backdrop`
    : '\nBackdrop contrast passed on every sampled frame',
);
process.exit(failures ? 1 : 0);
