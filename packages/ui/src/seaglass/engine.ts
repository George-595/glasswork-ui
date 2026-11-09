import type { Rgb } from '../effects/cssColor';
import { hasCoarsePointer } from '../effects/lowPower';
import { LagMonitor, type SeaGlassVerdict } from './perf';
import { FRAGMENT_SHADER, MAX_PIECES, VERTEX_SHADER } from './shader';

/* The sea glass engine: one WebGL canvas behind a stage, drawing every registered piece.

   Each frame (live) it measures the pieces' boxes against the canvas, steps the springs (hover
   lifts a piece, a press sinks it, a new tint eases in, a pulse glows), and draws only while
   something moves. When nothing is moving and the lag probe is over, the frame loop STOPS (it
   does not idle at 60 callbacks a second, measuring every piece for nothing); it starts again
   from invalidate() (the stage calls it when the layout or a piece changes), a pointer event
   on a piece, a scroll inside the stage, or a resize. Adapted from Blueemi/sea-glass-demo (MIT).

   Two modes:
     live   the loop above, plus the lag monitor (perf.ts): it draws every frame for the first
            five seconds, judges them, and reports a verdict;
     still  no loop: one settled frame, drawn again only when `invalidate()` is called (the
            stage calls it when the layout or a piece changes). Reduced motion and the lag
            fallback both use it. */
export interface Lighting {
  paper: Rgb;
  sun: Rgb;
  sky: Rgb;
  /** seaglass-0 … seaglass-6. */
  tints: readonly Rgb[];
  /** Moonlit (dark mode): less frost. */
  dark: boolean;
}

export interface PieceState {
  /** 0 = clear, 1..6 = the hues. */
  tint: number;
  nested: boolean;
  /** Thickness as a share of the piece's shorter half side (capped). */
  height: number;
  /** Rest height above the paper. */
  rest: number;
  wobble: number;
  density: number;
  frost: number;
  /** A pulsing glow (a thinking composer). */
  pulse: boolean;
  /** A steady glow (a piece that is on). */
  glow: number;
}

export interface PieceHandle {
  el: HTMLElement;
  read: () => PieceState;
}

export interface EngineOptions {
  /** No paper: a transparent canvas, shadows as a veil. */
  clear: boolean;
  mode: 'live' | 'still';
  /** Drop the pieces onto the paper when it starts (live only). */
  intro: boolean;
  /** Light from straight above, no wobbling edge and no pointer nudge: a piece and its shadow
      are the same on the left as on the right, so a centred layout stays centred. */
  symmetric?: boolean;
  /** Live only: the lag monitor's verdict, once (and later if the watchdog trips). */
  onVerdict?: (verdict: SeaGlassVerdict) => void;
  /** The first frame is on screen. */
  onReady?: () => void;
  /** The GPU dropped the context. */
  onLost?: () => void;
}

interface Body {
  handle: PieceHandle;
  seed: number;
  lift: number;
  liftV: number;
  scale: number;
  scaleV: number;
  hover: boolean;
  pressed: boolean;
  glow: number;
  tint: [number, number, number] | null;
  delay: number;
  box: Box | null;
  cs: CSSStyleDeclaration | null;
  off: () => void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  rad: [number, number, number, number];
  a: number;
}

const UNIFORMS = [
  'uRes',
  'uDpr',
  'uExpo',
  'uTilt',
  'uClear',
  'uFrost',
  'uNight',
  'uL',
  'uSun',
  'uSky',
  'uPaper',
  'uN',
  'uRect',
  'uRad',
  'uShape',
  'uTint',
  'uMisc',
] as const;
type UniformName = (typeof UNIFORMS)[number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linear = (rgb: Rgb): [number, number, number] => [
  toLinear(rgb[0]),
  toLinear(rgb[1]),
  toLinear(rgb[2]),
];

/* The springs were tuned as one step per 60 Hz frame; this turns such a step into the matching
   continuous spring [stiffness, damping], run in 240 Hz substeps so it moves the same at any
   refresh rate (upstream's own conversion). */
const SUB = 0.25;
const spring = (k: number, d: number): [number, number] => {
  const r = Math.sqrt(d);
  const sg = -Math.log(r);
  const an = Math.acos(Math.min(1, (1 + d - d * k) / 2 / r));
  return [sg * sg + an * an, 2 * sg];
};
const SP_LIFT = spring(0.1, 0.78);
const SP_SCALE = spring(0.2, 0.68);

/** The canvas's device-pixel-ratio caps and its pixel budget (width x height x ratio squared). */
export const MAX_DPR = 1.5;
export const MAX_DPR_COARSE = 1.25;
export const PIXEL_BUDGET = 1.2e6;

/** A steady pulse value for a still frame. */
const STILL_PULSE = 0.3;

function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  if (
    Math.abs(a.x - b.x) > 0.05 ||
    Math.abs(a.y - b.y) > 0.05 ||
    Math.abs(a.w - b.w) > 0.05 ||
    Math.abs(a.h - b.h) > 0.05 ||
    Math.abs(a.a - b.a) > 0.002
  )
    return false;
  for (let c = 0; c < 4; c++) if (Math.abs((a.rad[c] ?? 0) - (b.rad[c] ?? 0)) > 0.05) return false;
  return true;
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

export class SeaGlassEngine {
  private readonly gl: WebGLRenderingContext;
  private readonly u: Record<UniformName, WebGLUniformLocation | null>;
  private readonly arrays = {
    rect: new Float32Array(MAX_PIECES * 4),
    rad: new Float32Array(MAX_PIECES * 4),
    shape: new Float32Array(MAX_PIECES * 4),
    tint: new Float32Array(MAX_PIECES * 4),
    misc: new Float32Array(MAX_PIECES * 4),
  };
  private bodies: Body[] = [];
  private lighting: {
    paper: number[];
    sun: number[];
    sky: number[];
    tints: [number, number, number][];
    dark: boolean;
  } | null = null;
  private mode: 'live' | 'still';
  private frame = 0;
  private last = 0;
  private drewLast = false;
  private activeUntil = 0;
  private subAcc = 0;
  private quality = 1;
  private slow = 0;
  private readonly started: number;
  private readonly monitor: LagMonitor;
  private ready = false;
  private destroyed = false;
  private width = 0;
  private height = 0;
  private dpr = 1;
  /** The host's font size over 16px, read on resize rather than every frame. */
  private unit = 1;
  private light = { nx: 0, ny: 0, tnx: 0, tny: 0 };
  private readonly cleanups: Array<() => void> = [];
  private readonly canvas: HTMLCanvasElement;
  private readonly host: HTMLElement;
  private readonly options: EngineOptions;

  /** A WebGL engine on `canvas`, or null when the browser cannot run the shader. */
  static create(
    canvas: HTMLCanvasElement,
    host: HTMLElement,
    options: EngineOptions,
  ): SeaGlassEngine | null {
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl', {
        antialias: false,
        alpha: options.clear,
        premultipliedAlpha: true,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
      });
    } catch {
      return null;
    }
    if (!gl) return null;
    const vectors = Number(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)) || 0;
    if ((vectors - 13) / 5 < MAX_PIECES) return SeaGlassEngine.release(gl);
    let fs = FRAGMENT_SHADER;
    const hp = gl.getShaderPrecisionFormat?.(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (hp && hp.precision === 0)
      fs = fs.replace('precision highp float;', 'precision mediump float;');
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fsh = compile(gl, gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram();
    if (!vs || !fsh || !prog) return SeaGlassEngine.release(gl);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return SeaGlassEngine.release(gl);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = Object.fromEntries(
      UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)]),
    ) as Record<UniformName, WebGLUniformLocation | null>;
    return new SeaGlassEngine(gl, u, canvas, host, options);
  }

  private static release(gl: WebGLRenderingContext): null {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }

  private constructor(
    gl: WebGLRenderingContext,
    u: Record<UniformName, WebGLUniformLocation | null>,
    canvas: HTMLCanvasElement,
    host: HTMLElement,
    options: EngineOptions,
  ) {
    this.gl = gl;
    this.canvas = canvas;
    this.host = host;
    this.options = options;
    this.u = u;
    this.mode = options.mode;
    this.started = performance.now();
    this.monitor = new LagMonitor(this.started);

    const lost = (e: Event) => {
      e.preventDefault();
      this.stopLoop();
      options.onLost?.();
    };
    canvas.addEventListener('webglcontextlost', lost);
    this.cleanups.push(() => canvas.removeEventListener('webglcontextlost', lost));

    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(host);
      this.cleanups.push(() => ro.disconnect());
    }
    const onWindow = () => this.resize();
    window.addEventListener('resize', onWindow);
    this.cleanups.push(() => window.removeEventListener('resize', onWindow));
    // a scroller inside the stage moves the pieces under it: draw them where they went
    const onScroll = () => this.invalidate();
    host.addEventListener('scroll', onScroll, { passive: true, capture: true });
    this.cleanups.push(() => host.removeEventListener('scroll', onScroll, { capture: true }));

    // the pointer nudges the sun a little (live only)
    const aim = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || this.mode !== 'live') return;
      const r = host.getBoundingClientRect();
      const clamp = (v: number) => Math.min(1, Math.max(-1, v));
      this.light.tnx = clamp((e.clientX - r.left - r.width / 2) / Math.max(r.width / 2, 1));
      this.light.tny = clamp((e.clientY - r.top - r.height / 2) / Math.max(r.height / 2, 1));
      this.wake();
    };
    document.addEventListener('pointermove', aim, { passive: true });
    this.cleanups.push(() => document.removeEventListener('pointermove', aim));
    const release = () => {
      for (const b of this.bodies) b.pressed = false;
      this.wake();
    };
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
    this.cleanups.push(() => {
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
    });
    const onVisibility = () => {
      if (document.hidden) this.monitor.pause();
      this.drewLast = false;
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

    this.resize();
    if (this.mode === 'live') this.startLoop();
  }

  setLighting(l: Lighting): void {
    this.lighting = {
      paper: linear(l.paper),
      sun: linear(l.sun),
      sky: linear(l.sky),
      tints: l.tints.map(linear),
      dark: l.dark,
    };
    this.invalidate();
  }

  /** The pieces, in draw order (a piece resting on another comes after it). */
  setPieces(handles: readonly PieceHandle[]): void {
    const old = new Map(this.bodies.map((b) => [b.handle, b]));
    const now = performance.now();
    const intro = this.options.intro && this.mode === 'live' && !this.ready;
    this.bodies = handles.map((handle, i) => {
      const kept = old.get(handle);
      if (kept) {
        old.delete(handle);
        return kept;
      }
      const body: Body = {
        handle,
        seed: (1.37 + i * 2.713) % 17,
        lift: 0,
        liftV: 0,
        scale: 1,
        scaleV: 0,
        hover: false,
        pressed: false,
        glow: 0,
        tint: null,
        delay: 0,
        box: null,
        cs: null,
        off: () => {},
      };
      const el = handle.el;
      const enter = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse') return;
        body.hover = true;
        this.wake();
      };
      const leave = () => {
        body.hover = false;
        this.wake();
      };
      const down = () => {
        body.pressed = true;
        this.wake();
      };
      el.addEventListener('pointerenter', enter);
      el.addEventListener('pointerleave', leave);
      el.addEventListener('pointerdown', down);
      body.off = () => {
        el.removeEventListener('pointerenter', enter);
        el.removeEventListener('pointerleave', leave);
        el.removeEventListener('pointerdown', down);
      };
      return body;
    });
    for (const gone of old.values()) gone.off();
    if (intro) {
      // the pieces drop onto the paper one by one, top-left first
      this.bodies
        .filter((b) => !b.handle.read().nested)
        .map((b) => ({ b, r: b.handle.el.getBoundingClientRect() }))
        .sort((p, q) => p.r.top + p.r.left * 0.3 - (q.r.top + q.r.left * 0.3))
        .forEach(({ b }, i) => {
          if (b.lift !== 0 || b.delay !== 0) return;
          b.delay = now + 120 + i * 60;
          b.lift = 40;
        });
    }
    this.invalidate();
  }

  setMode(mode: 'live' | 'still'): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'live') {
      this.startLoop();
    } else {
      this.stopLoop();
      this.invalidate();
    }
  }

  /** Something changed: draw again (live: keep drawing for a moment). */
  invalidate(): void {
    if (this.destroyed) return;
    if (this.mode === 'live') {
      this.activeUntil = Math.max(this.activeUntil, performance.now() + 400);
      this.startLoop();
      return;
    }
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.settle();
      this.render();
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopLoop();
    cancelAnimationFrame(this.frame);
    for (const b of this.bodies) b.off();
    for (const fn of this.cleanups) fn();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private startLoop(): void {
    if (this.frame || this.destroyed) return;
    this.drewLast = false;
    const tick = (now: number) => {
      this.frame = requestAnimationFrame(tick);
      this.step(now);
    };
    this.frame = requestAnimationFrame((now) => {
      this.last = now;
      tick(now);
    });
  }

  private stopLoop(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  /** Something that can move a piece happened: make sure the loop is running for a moment. */
  private wake(): void {
    if (this.mode !== 'live' || this.destroyed) return;
    this.activeUntil = Math.max(this.activeUntil, performance.now() + 400);
    this.startLoop();
  }

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    // glass is soft and frosted: more than 1.25x (touch) or 1.5x (a mouse) is pixels nobody sees
    let d = Math.min(window.devicePixelRatio || 1, hasCoarsePointer() ? MAX_DPR_COARSE : MAX_DPR);
    if (w * h * d * d > PIXEL_BUDGET) d = Math.sqrt(PIXEL_BUDGET / Math.max(w * h, 1));
    this.unit = (Number.parseFloat(getComputedStyle(this.host).fontSize) || 16) / 16;
    this.dpr = Math.max(0.6, d * this.quality);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.max(1, Math.round(w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(h * this.dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.invalidate();
  }

  private measure(b: Body, origin: DOMRect): Box | null {
    const el = b.handle.el;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    if (!b.cs) b.cs = getComputedStyle(el);
    const cs = b.cs;
    const a = Number.parseFloat(cs.opacity);
    const alpha = Number.isFinite(a) ? a : 1;
    if (!(alpha > 0.01) || cs.visibility === 'hidden') return null;
    const x = r.left - origin.left;
    const y = r.top - origin.top;
    if (y + r.height < -160 || y > this.height + 160 || x + r.width < -160 || x > this.width + 160)
      return null;
    const s = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const px = (v: string) => (Number.parseFloat(v) || 0) * s;
    return {
      x,
      y,
      w: r.width,
      h: r.height,
      rad: [
        px(cs.borderTopLeftRadius),
        px(cs.borderTopRightRadius),
        px(cs.borderBottomRightRadius),
        px(cs.borderBottomLeftRadius),
      ],
      a: alpha,
    };
  }

  /** Still: everything at rest, at once. */
  private settle(): void {
    const origin = this.host.getBoundingClientRect();
    for (const b of this.bodies) {
      const st = b.handle.read();
      b.box = this.measure(b, origin);
      b.lift = 0;
      b.liftV = 0;
      b.scale = 1;
      b.scaleV = 0;
      b.delay = 0;
      b.glow = st.pulse ? STILL_PULSE : st.glow;
      const target = this.lighting?.tints[st.tint];
      if (target) b.tint = [...target];
    }
    this.light.nx = 0;
    this.light.ny = 0;
  }

  /** Live: one frame of springs, eases and measuring. Returns whether anything moved. */
  private update(now: number, k: number): boolean {
    let moving = false;
    this.subAcc += k / SUB;
    const n = Math.floor(this.subAcc);
    this.subAcc -= n;
    const fT = 1 - 0.92 ** k;
    const fG = 1 - 0.85 ** k;
    const origin = this.host.getBoundingClientRect();
    for (const b of this.bodies) {
      const st = b.handle.read();
      const box = this.measure(b, origin);
      if (!sameBox(box, b.box)) moving = true;
      b.box = box;
      const target = this.lighting?.tints[st.tint];
      if (target) {
        if (!b.tint) b.tint = [...target];
        for (let c = 0; c < 3; c++) {
          const d = (target[c] ?? 0) - (b.tint[c] ?? 0);
          if (Math.abs(d) > 0.0005) {
            b.tint[c] = (b.tint[c] ?? 0) + d * fT;
            moving = true;
          }
        }
      }
      if (now < b.delay) {
        moving = true;
        continue;
      }
      const tl = b.pressed ? -st.rest : b.hover ? (st.nested ? 1 : 3) : 0;
      const ts = b.pressed ? 0.982 : 1;
      for (let s = 0; s < n; s++) {
        b.liftV += ((tl - b.lift) * SP_LIFT[0] - b.liftV * SP_LIFT[1]) * SUB;
        b.lift += b.liftV * SUB;
        b.scaleV += ((ts - b.scale) * SP_SCALE[0] - b.scaleV * SP_SCALE[1]) * SUB;
        b.scale += b.scaleV * SUB;
      }
      if (
        Math.abs(b.liftV) > 0.01 ||
        Math.abs(tl - b.lift) > 0.05 ||
        Math.abs(ts - b.scale) > 0.0005
      )
        moving = true;
      const gt = st.pulse ? 0.3 + 0.22 * Math.sin(now / 170) : st.glow;
      b.glow += (gt - b.glow) * fG;
      if (st.pulse || Math.abs(gt - b.glow) > 0.002) moving = true;
    }
    const ease = (key: 'nx' | 'ny', target: number) => {
      const d = target - this.light[key];
      if (Math.abs(d) > 0.002) {
        this.light[key] += d * (1 - 0.965 ** k);
        moving = true;
      } else this.light[key] = target;
    };
    ease('nx', this.light.tnx);
    ease('ny', this.light.tny);
    return moving;
  }

  private step(now: number): void {
    const interval = now - this.last;
    const k = Math.min(3, interval / 16.667);
    this.last = now;
    const moving = this.update(now, k);
    const active = moving || this.monitor.probing(now) || now < this.activeUntil;
    if (!active) {
      // nothing moves and the probe is over: stop asking for frames until something wakes us
      this.drewLast = false;
      this.monitor.pause();
      this.stopLoop();
      return;
    }
    let verdict: SeaGlassVerdict | null;
    if (this.drewLast) {
      verdict = this.monitor.frame(now, interval);
      // on the way, give up resolution before giving up motion
      if (this.monitor.probing(now)) {
        this.slow = interval > 40 ? this.slow + 1 : Math.max(0, this.slow - 1);
        if (this.slow > 12 && this.quality > 0.55) {
          this.quality *= 0.8;
          this.slow = 0;
          this.resize();
        }
      }
    } else {
      verdict = this.monitor.overdue(now);
    }
    this.render();
    this.drewLast = true;
    if (verdict) this.options.onVerdict?.(verdict);
  }

  private render(): void {
    if (this.destroyed || !this.lighting) return;
    const { gl, u, arrays: A, lighting } = this;
    const unit = this.unit;
    let n = 0;
    for (const b of this.bodies) {
      const m = b.box;
      if (!m || n >= MAX_PIECES || !b.tint) continue;
      const st = b.handle.read();
      const i = n * 4;
      const sc = b.scale;
      const hw = (m.w / 2) * sc;
      const hh = (m.h / 2) * sc;
      const mn = Math.min(hw, hh);
      A.rect[i] = m.x + m.w / 2;
      A.rect[i + 1] = m.y + m.h / 2;
      A.rect[i + 2] = hw;
      A.rect[i + 3] = hh;
      for (let c = 0; c < 4; c++) A.rad[i + c] = Math.min((m.rad[c] ?? 0) * sc, mn);
      const th = Math.min(mn * st.height, (st.nested ? 6 : 28) * unit);
      A.shape[i] = Math.max(mn * 0.95, 1);
      A.shape[i + 1] = th;
      A.shape[i + 2] = Math.max(0, (st.rest + b.lift) * unit);
      A.shape[i + 3] = m.a + (st.nested ? 2 : 0);
      A.tint[i] = b.tint[0];
      A.tint[i + 1] = b.tint[1];
      A.tint[i + 2] = b.tint[2];
      A.tint[i + 3] = st.frost;
      A.misc[i] = b.seed;
      A.misc[i + 1] = this.options.symmetric ? 0 : Math.min(st.wobble * unit, mn * 0.12);
      A.misc[i + 2] = st.density;
      A.misc[i + 3] = b.glow;
      n++;
    }
    // the sun is low in the upper left, and shifts a little with the pointer; a symmetric stage
    // has it high and straight above (the shadow falls straight down, left and right alike)
    const sym = this.options.symmetric === true;
    const az = sym ? -Math.PI / 2 : Math.atan2(-0.53, -0.85) + this.light.nx * 0.12;
    const el = sym ? 0.62 : 0.4 - this.light.ny * 0.03;
    const c = Math.cos(el);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uDpr, this.canvas.width / Math.max(this.width, 1));
    gl.uniform1f(u.uExpo, 1);
    gl.uniform1f(u.uTilt, 0.3);
    gl.uniform1f(u.uClear, this.options.clear ? 1 : 0);
    gl.uniform1f(u.uFrost, lighting.dark ? 0.32 : 1);
    gl.uniform1f(u.uNight, lighting.dark ? 1 : 0);
    gl.uniform3f(u.uL, Math.cos(az) * c, Math.sin(az) * c, Math.sin(el));
    gl.uniform3fv(u.uSun, lighting.sun);
    gl.uniform3fv(u.uSky, lighting.sky);
    gl.uniform3fv(u.uPaper, lighting.paper);
    gl.uniform1i(u.uN, n);
    gl.uniform4fv(u.uRect, A.rect);
    gl.uniform4fv(u.uRad, A.rad);
    gl.uniform4fv(u.uShape, A.shape);
    gl.uniform4fv(u.uTint, A.tint);
    gl.uniform4fv(u.uMisc, A.misc);
    if (this.options.clear) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!this.ready) {
      this.ready = true;
      this.options.onReady?.();
    }
  }
}
