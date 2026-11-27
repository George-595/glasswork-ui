/* A QR code encoder, written for this kit from ISO/IEC 18004 (no dependency, no copied code).

   What it does and no more: byte mode (the text as UTF-8), error correction level M, versions 1 to 10 (up to 213
   bytes), the mask chosen by the standard's four penalty rules. That is enough for any address or short code a
   screen needs to hand to a phone's camera. A longer text is refused, never cut.

   `encodeQr(text)` returns the finished matrix: `modules[row][col]` is true for a dark module. The quiet zone is the
   drawing's job (QrCode.tsx), not the matrix's. */

export interface QrMatrix {
  version: number;
  size: number;
  /** Which of the eight masks the penalty rules chose. */
  mask: number;
  modules: boolean[][];
}

/** The most bytes a code can carry at level M in versions 1 to 10. */
export const QR_MAX_BYTES = 213;

/* Level M, per version: the data codewords, the error-correction codewords of each block, and the blocks as
   [count, data codewords in each]. Short blocks come first. (ISO/IEC 18004 table 9.) */
const M_TABLE: readonly {
  data: number;
  ec: number;
  blocks: readonly (readonly [number, number])[];
}[] = [
  { data: 16, ec: 10, blocks: [[1, 16]] },
  { data: 28, ec: 16, blocks: [[1, 28]] },
  { data: 44, ec: 26, blocks: [[1, 44]] },
  { data: 64, ec: 18, blocks: [[2, 32]] },
  { data: 86, ec: 24, blocks: [[2, 43]] },
  { data: 108, ec: 16, blocks: [[4, 27]] },
  { data: 124, ec: 18, blocks: [[4, 31]] },
  {
    data: 154,
    ec: 22,
    blocks: [
      [2, 38],
      [2, 39],
    ],
  },
  {
    data: 182,
    ec: 22,
    blocks: [
      [3, 36],
      [2, 37],
    ],
  },
  {
    data: 216,
    ec: 26,
    blocks: [
      [4, 43],
      [1, 44],
    ],
  },
];

/** The centres of the alignment patterns, by version (index 0 is version 1). */
const ALIGN: readonly (readonly number[])[] = [
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
];

/* ---- Reed-Solomon over GF(256), polynomial 0x11D ---- */

function gfMul(a: number, b: number): number {
  let r = 0;
  for (let i = 7; i >= 0; i--) {
    r = (r << 1) ^ ((r >>> 7) * 0x11d);
    r ^= ((b >>> i) & 1) * a;
  }
  return r & 0xff;
}

/** The generator polynomial's coefficients (leading 1 left out) for `degree` error-correction codewords. */
function divisor(degree: number): number[] {
  const out = Array.from({ length: degree }, () => 0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j] ?? 0, root);
      if (j + 1 < degree) out[j] = (out[j] ?? 0) ^ (out[j + 1] ?? 0);
    }
    root = gfMul(root, 0x02);
  }
  return out;
}

function remainder(data: readonly number[], div: readonly number[]): number[] {
  const out = Array.from({ length: div.length }, () => 0);
  for (const b of data) {
    const factor = b ^ (out.shift() ?? 0);
    out.push(0);
    div.forEach((c, i) => {
      out[i] = (out[i] ?? 0) ^ gfMul(c, factor);
    });
  }
  return out;
}

/* ---- the codewords ---- */

function dataCodewords(bytes: Uint8Array, version: number): number[] {
  const capacity = (M_TABLE[version - 1]?.data ?? 0) * 8;
  const bits: number[] = [];
  const put = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4); // byte mode
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capacity - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let w = 0;
    for (let j = 0; j < 8; j++) w = (w << 1) | (bits[i + j] ?? 0);
    words.push(w);
  }
  for (let pad = 0xec; words.length < capacity / 8; pad ^= 0xec ^ 0x11) words.push(pad);
  return words;
}

/** The data cut into blocks, each followed by its error correction, then interleaved as the standard says. */
function allCodewords(data: readonly number[], version: number): number[] {
  const row = M_TABLE[version - 1];
  if (!row) throw new RangeError('QR version out of range');
  const div = divisor(row.ec);
  const blocks: { data: number[]; ec: number[] }[] = [];
  let at = 0;
  for (const [count, size] of row.blocks) {
    for (let i = 0; i < count; i++) {
      const d = data.slice(at, at + size);
      at += size;
      blocks.push({ data: d, ec: remainder(d, div) });
    }
  }
  const out: number[] = [];
  const longest = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < longest; i++)
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i] ?? 0);
  for (let i = 0; i < row.ec; i++) for (const b of blocks) out.push(b.ec[i] ?? 0);
  return out;
}

/* ---- the matrix ---- */

const bit = (value: number, i: number): boolean => ((value >>> i) & 1) === 1;

class Grid {
  readonly size: number;
  readonly dark: boolean[][];
  /** True for every module that is not data: finders, timing, alignment, format, version. */
  readonly fixed: boolean[][];
  readonly version: number;
  constructor(version: number) {
    this.version = version;
    this.size = version * 4 + 17;
    this.dark = Array.from({ length: this.size }, () =>
      Array.from({ length: this.size }, () => false),
    );
    this.fixed = Array.from({ length: this.size }, () =>
      Array.from({ length: this.size }, () => false),
    );
  }
  set(x: number, y: number, dark: boolean, fixed = true): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    (this.dark[y] as boolean[])[x] = dark;
    if (fixed) (this.fixed[y] as boolean[])[x] = true;
  }
  get(x: number, y: number): boolean {
    return this.dark[y]?.[x] ?? false;
  }
}

function finder(g: Grid, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      g.set(cx + dx, cy + dy, d !== 2 && d !== 4);
    }
}

function align(g: Grid, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      g.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
}

function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // level M is 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormat(g: Grid, mask: number): void {
  const bits = formatBits(mask);
  const n = g.size;
  for (let i = 0; i <= 5; i++) g.set(8, i, bit(bits, i));
  g.set(8, 7, bit(bits, 6));
  g.set(8, 8, bit(bits, 7));
  g.set(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) g.set(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i++) g.set(n - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) g.set(8, n - 15 + i, bit(bits, i));
  g.set(8, n - 8, true); // the one module that is always dark
}

function drawFunctions(g: Grid): void {
  const n = g.size;
  for (let i = 0; i < n; i++) {
    g.set(6, i, i % 2 === 0);
    g.set(i, 6, i % 2 === 0);
  }
  finder(g, 3, 3);
  finder(g, n - 4, 3);
  finder(g, 3, n - 4);
  const centres = ALIGN[g.version - 1] ?? [];
  const last = centres.length - 1;
  for (const [i, cy] of centres.entries()) {
    for (const [j, cx] of centres.entries()) {
      // the three corners that hold a finder have no alignment pattern
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      align(g, cx, cy);
    }
  }
  drawFormat(g, 0); // reserves the format modules; the chosen mask's bits replace them
  if (g.version >= 7) {
    let rem = g.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (g.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      g.set(a, b, bit(bits, i));
      g.set(b, a, bit(bits, i));
    }
  }
}

/** The data modules, from the bottom right, two columns at a time, up then down. */
function drawCodewords(g: Grid, words: readonly number[]): void {
  const n = g.size;
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the timing column is skipped
    for (let v = 0; v < n; v++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? n - 1 - v : v;
        if ((g.fixed[y] as boolean[])[x]) continue;
        const dark = i < words.length * 8 ? bit(words[i >>> 3] ?? 0, 7 - (i & 7)) : false;
        g.set(x, y, dark, false);
        i++;
      }
  }
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(g: Grid, mask: number): void {
  const test = MASKS[mask];
  if (!test) return;
  for (let y = 0; y < g.size; y++)
    for (let x = 0; x < g.size; x++)
      if (!(g.fixed[y] as boolean[])[x] && test(x, y)) (g.dark[y] as boolean[])[x] = !g.get(x, y);
}

/** The standard's four penalty rules (runs, 2x2 blocks, finder-like runs, dark balance). */
function penalty(g: Grid): number {
  const n = g.size;
  let total = 0;
  const lines: boolean[][] = [];
  for (let i = 0; i < n; i++) {
    lines.push(g.dark[i] as boolean[]);
    lines.push(Array.from({ length: n }, (_, y) => g.get(i, y)));
  }
  const FINDER = [true, false, true, true, true, false, true];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) total += 3 + (run - 5);
        run = 1;
      }
    }
    for (let i = 0; i + 7 <= n; i++) {
      if (!FINDER.every((v, k) => line[i + k] === v)) continue;
      // the pattern with four light modules before it, or after it (each side counts)
      if (i >= 4 && line.slice(i - 4, i).every((v) => !v)) total += 40;
      if (i + 11 <= n && line.slice(i + 7, i + 11).every((v) => !v)) total += 40;
    }
  }
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const c = g.get(x, y);
      if (c === g.get(x + 1, y) && c === g.get(x, y + 1) && c === g.get(x + 1, y + 1)) total += 3;
    }
  let dark = 0;
  for (const row of g.dark) for (const m of row) if (m) dark++;
  const cells = n * n;
  total += (Math.ceil(Math.abs(dark * 20 - cells * 10) / cells) - 1) * 10;
  return total;
}

/** The smallest version (1 to 10) that holds `length` bytes at level M, or null. */
export function versionFor(length: number): number | null {
  for (let v = 1; v <= M_TABLE.length; v++) {
    // the mode takes 4 bits and the length 8 (16 from version 10)
    const bytes = Math.floor(((M_TABLE[v - 1]?.data ?? 0) * 8 - (v < 10 ? 12 : 20)) / 8);
    if (length <= bytes) return v;
  }
  return null;
}

/** Encode `text` (as UTF-8) at level M. Throws a RangeError when it needs more than version 10. */
export function encodeQr(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const version = versionFor(bytes.length);
  if (version === null) throw new RangeError(`A QR code here holds at most ${QR_MAX_BYTES} bytes`);
  const words = allCodewords(dataCodewords(bytes, version), version);
  const g = new Grid(version);
  drawFunctions(g);
  drawCodewords(g, words);
  let best = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(g, mask);
    drawFormat(g, mask);
    const score = penalty(g);
    if (score < bestScore) {
      best = mask;
      bestScore = score;
    }
    applyMask(g, mask); // XOR again: undone
  }
  applyMask(g, best);
  drawFormat(g, best);
  return { version, size: g.size, mask: best, modules: g.dark.map((r) => [...r]) };
}
