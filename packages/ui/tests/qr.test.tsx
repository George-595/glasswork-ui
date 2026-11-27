// @vitest-environment jsdom
/* QrCode and its encoder (src/display/QrCode.tsx, src/display/qr/encode.ts). The encoder is checked against a decoder
   written here from the standard: the format information (BCH-checked, its mask removed), the codewords read back in the
   standard's order and un-interleaved, each block's Reed-Solomon syndromes all zero, and the text read out of the
   data. Nothing here shares code with the encoder. */
import { contrast, THEMES } from '@apps/colors';
import axe from 'axe-core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { encodeQr, QR_MAX_BYTES, QrCode } from '../src/display';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ---- a decoder, written for the test ---- */
const EXP: number[] = [];
const LOG: number[] = Array.from({ length: 256 }, () => 0);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
const mul = (a: number, b: number) =>
  a === 0 || b === 0 ? 0 : (EXP[((LOG[a] ?? 0) + (LOG[b] ?? 0)) % 255] ?? 0);

const BLOCKS_M: Record<number, { ec: number; sizes: number[] }> = {
  1: { ec: 10, sizes: [16] },
  2: { ec: 16, sizes: [28] },
  3: { ec: 26, sizes: [44] },
  4: { ec: 18, sizes: [32, 32] },
  5: { ec: 24, sizes: [43, 43] },
  6: { ec: 16, sizes: [27, 27, 27, 27] },
  7: { ec: 18, sizes: [31, 31, 31, 31] },
  8: { ec: 22, sizes: [38, 38, 39, 39] },
  9: { ec: 22, sizes: [36, 36, 36, 37, 37] },
  10: { ec: 26, sizes: [43, 43, 43, 43, 44] },
};

const MASK_FNS = [
  (r: number, c: number) => (r + c) % 2 === 0,
  (r: number) => r % 2 === 0,
  (_r: number, c: number) => c % 3 === 0,
  (r: number, c: number) => (r + c) % 3 === 0,
  (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** Is (r, c) a module that carries data (not a finder, timing, alignment, format or version module)? */
function isData(version: number, r: number, c: number): boolean {
  const n = version * 4 + 17;
  if (r === 6 || c === 6) return false;
  if ((r < 9 && c < 9) || (r < 9 && c >= n - 8) || (r >= n - 8 && c < 9)) return false;
  if (version >= 7 && ((r < 6 && c >= n - 11) || (c < 6 && r >= n - 11))) return false;
  const centres = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
  ][version - 1] as number[];
  for (const cy of centres)
    for (const cx of centres) {
      const corner =
        (cy === 6 && cx === 6) ||
        (cy === 6 && cx === centres.at(-1)) ||
        (cx === 6 && cy === centres.at(-1));
      if (!corner && Math.abs(r - cy) <= 2 && Math.abs(c - cx) <= 2) return false;
    }
  return true;
}

function decode(m: { version: number; size: number; modules: boolean[][] }): {
  mask: number;
  text: string;
} {
  const g = (r: number, c: number) => m.modules[r]?.[c] === true;
  const n = m.size;
  // format information: both copies agree, the BCH remainder is zero, the level is M (00)
  let a = 0;
  for (let i = 0; i < 15; i++) {
    const [r, c] =
      i < 6 ? [i, 8] : i === 6 ? [7, 8] : i === 7 ? [8, 8] : i === 8 ? [8, 7] : [8, 14 - i];
    a |= (g(r as number, c as number) ? 1 : 0) << i;
  }
  let b = 0;
  for (let i = 0; i < 15; i++) {
    const [r, c] = i < 8 ? [8, n - 1 - i] : [n - 15 + i, 8];
    b |= (g(r as number, c as number) ? 1 : 0) << i;
  }
  expect(b).toBe(a);
  const fmt = a ^ 0x5412;
  let rem = fmt;
  for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  expect(rem).toBe(0);
  expect(fmt >>> 13).toBe(0); // level M
  const mask = (fmt >>> 10) & 7;
  // the codewords, in the standard's order, with the mask taken off
  const bits: number[] = [];
  let up = true;
  for (let col = n - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;
    for (let i = 0; i < n; i++) {
      const r = up ? n - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (!isData(m.version, r, c)) continue;
        bits.push(g(r, c) !== (MASK_FNS[mask] as (r: number, c: number) => boolean)(r, c) ? 1 : 0);
      }
    }
    up = !up;
  }
  const words: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    words.push(bits.slice(i, i + 8).reduce((x, y) => (x << 1) | y, 0));
  // un-interleave
  const { ec, sizes } = BLOCKS_M[m.version] as { ec: number; sizes: number[] };
  const blocks = sizes.map(() => ({ data: [] as number[], ec: [] as number[] }));
  let at = 0;
  const longest = Math.max(...sizes);
  for (let i = 0; i < longest; i++)
    sizes.forEach((s, j) => {
      if (i < s) blocks[j]?.data.push(words[at++] ?? 0);
    });
  for (let i = 0; i < ec; i++) for (const blk of blocks) blk.ec.push(words[at++] ?? 0);
  // every block is a multiple of the generator: its syndromes at alpha^0 .. alpha^(ec-1) are zero
  for (const blk of blocks) {
    const poly = [...blk.data, ...blk.ec];
    for (let k = 0; k < ec; k++) {
      let s = 0;
      for (const coef of poly) s = mul(s, EXP[k] ?? 0) ^ coef;
      expect(s).toBe(0);
    }
  }
  // the text: mode 0100, the length, the bytes
  const data = blocks.flatMap((x) => x.data);
  const stream = data.flatMap((w) => Array.from({ length: 8 }, (_, i) => (w >>> (7 - i)) & 1));
  const take = (count: number, from: number) =>
    stream.slice(from, from + count).reduce((x, y) => (x << 1) | y, 0);
  expect(take(4, 0)).toBe(0b0100);
  const lenBits = m.version < 10 ? 8 : 16;
  const len = take(lenBits, 4);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = take(8, 4 + lenBits + i * 8);
  return { mask, text: new TextDecoder().decode(out) };
}

describe('the QR encoder', () => {
  const cases = [
    'A',
    'HELLO WORLD',
    'https://example.test/bot?start=ABCDEFGH',
    'https://hub.example.test/settings#enrol',
    'x'.repeat(14), // the last that fits version 1
    'y'.repeat(15), // the first that needs version 2
    'Zoë and café: 日本語',
    `https://example.test/${'a'.repeat(100)}`, // a version with several alignment patterns
    'b'.repeat(122), // version 7: the version information
    'c'.repeat(152), // version 8: blocks of two sizes
    'd'.repeat(QR_MAX_BYTES), // version 10
  ];
  it.each(cases)('decodes back to what was put in: %s', (text) => {
    const m = encodeQr(text);
    expect(decode(m).text).toBe(text);
  });

  it('chooses the smallest version that holds the text', () => {
    expect(encodeQr('x'.repeat(14)).version).toBe(1);
    expect(encodeQr('x'.repeat(15)).version).toBe(2);
    expect(encodeQr('x'.repeat(26)).version).toBe(2);
    expect(encodeQr('x'.repeat(27)).version).toBe(3);
    expect(encodeQr('x'.repeat(QR_MAX_BYTES)).version).toBe(10);
  });

  it('refuses what does not fit, rather than cutting it', () => {
    expect(() => encodeQr('x'.repeat(QR_MAX_BYTES + 1))).toThrow(RangeError);
  });

  it('has the three finder patterns, the timing lines and the always-dark module', () => {
    const { modules, size } = encodeQr('https://example.test/');
    const finder = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          const edge = r === 0 || r === 6 || c === 0 || c === 6;
          const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          expect(modules[r0 + r]?.[c0 + c]).toBe(edge || core);
        }
    };
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) {
      expect(modules[6]?.[i]).toBe(i % 2 === 0);
      expect(modules[i]?.[6]).toBe(i % 2 === 0);
    }
    expect(modules[size - 8]?.[8]).toBe(true);
  });

  /* A fixed reference, so a mirrored mistake in both the encoder and the decoder above would still be noticed: "Hello, QR!"
     (10 bytes, byte mode, level M) is version 1 with mask 1. The matrix below was read back to exactly that text by an
     independent decoder, macOS CoreImage's QR detector (drawn at 10 px a module with a four-module quiet zone), on 13 Nov 2026. */
  const HELLO = [
    '#######.###...#######',
    '#.....#..####.#.....#',
    '#.###.#.#...#.#.###.#',
    '#.###.#..#.#..#.###.#',
    '#.###.#..#..#.#.###.#',
    '#.....#.#.....#.....#',
    '#######.#.#.#.#######',
    '.........#.#.........',
    '#.#...##.#.##..#..#.#',
    '###.#....#.....#.#..#',
    '#####.#.##....#.#.#.#',
    '##.#.#.#.##.##...#...',
    '#####.#..#....####.#.',
    '........##.#....###..',
    '#######.#..###.####.#',
    '#.....#..###.....#..#',
    '#.###.#..#.###...#.#.',
    '#.###.#...#.....###..',
    '#.###.#.###...#######',
    '#.....#.....#..###...',
    '#######.#.#..##..#..#',
  ];
  it('"Hello, QR!" is this exact matrix, which an independent decoder reads back', () => {
    const m = encodeQr('Hello, QR!');
    expect([m.version, m.mask]).toEqual([1, 1]);
    expect(m.modules.map((r) => r.map((d) => (d ? '#' : '.')).join(''))).toEqual(HELLO);
  });

  it('is the same every time for the same text', () => {
    expect(encodeQr('same').modules).toEqual(encodeQr('same').modules);
  });
});

describe('QrCode', () => {
  async function mount(node: React.ReactNode) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(node));
    return {
      host,
      done: async () => {
        await act(async () => root.unmount());
        host.remove();
      },
    };
  }

  it('is an image named for what it is for, drawn from the dark and light roles', async () => {
    const { host, done } = await mount(
      <QrCode value="https://t.me/x_bot?start=ABCDEFGH" label="linking Telegram" />,
    );
    const svg = host.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('QR code for linking Telegram');
    expect(host.querySelector('path')?.getAttribute('class')).toBe('fill-qr-ink');
    expect(host.querySelector('rect')?.getAttribute('class')).toBe('fill-qr-ground');
    // a four-module quiet zone on every side
    const m = encodeQr('https://t.me/x_bot?start=ABCDEFGH');
    expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${m.size + 8} ${m.size + 8}`);
    await done();
  });

  it('says so when the text is too long, and draws nothing', async () => {
    const { host, done } = await mount(<QrCode value={'x'.repeat(300)} label="a long thing" />);
    expect(host.querySelector('svg')).toBeNull();
    expect(host.textContent).toContain('too long');
    await done();
  });

  it('passes axe', async () => {
    const { host, done } = await mount(<QrCode value="hello" label="a greeting" />);
    const r = await axe.run(host, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
    });
    expect(r.violations).toEqual([]);
    await done();
  });

  it('is dark on light in all four themes, far above what a scanner needs, and the same in each (never inverted)', () => {
    const all = Object.entries(THEMES);
    for (const [, theme] of all) {
      expect(contrast(theme.roles['qr-ink'], theme.roles['qr-ground'])).toBeGreaterThanOrEqual(7);
      expect(theme.roles['qr-ink']).toBe(all[0]?.[1].roles['qr-ink']);
      expect(theme.roles['qr-ground']).toBe(all[0]?.[1].roles['qr-ground']);
    }
  });
});
