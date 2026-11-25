import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* WorkflowCanvas — an automation drawn as boxes and wires on an endless dotted canvas: a
   trigger, the steps it runs, the branches between them.

   - Pan by dragging the empty canvas, zoom with the wheel (about the pointer) or the +/− buttons;
     Fit brings every node into view. The dot grid scales and moves with the canvas.
   - Drag a node by its body to move it. Drag from a node's output port (its right edge) onto
     another node to wire them; a live wire follows the pointer.
   - Keyboard: every node is a button in reading order; arrow keys nudge it (Shift for a bigger
     step), and each move is said. The wires are drawn from the data, so the list of steps in
     order is also given as text for assistive tech.
   - Run plays the workflow: each node lights up in order (working, then done) while a bead of
     light travels down each wire into the next one. Under reduced motion the beads are skipped
     and the nodes step through their states.
   - A minimap in the corner shows every node and the part of the canvas in view. */
export type WorkflowKind = 'trigger' | 'action' | 'ai' | 'condition' | 'output';

export interface WorkflowNode {
  id: string;
  title: string;
  detail?: string;
  kind: WorkflowKind;
  icon?: IconName;
  x: number;
  y: number;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface WorkflowCanvasProps {
  nodes: readonly WorkflowNode[];
  edges: readonly WorkflowEdge[];
  label: string;
  onChange?: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
  /** Fit the whole workflow in view when the canvas is first measured (zooming out only,
      never in), for a flow wider than the box it sits in. Default false. */
  fitOnStart?: boolean;
  /** Height of the canvas. Default 26rem. */
  className?: string;
}

const W = 208;
const H = 72;
const KIND: Record<WorkflowKind, { icon: IconName; tone: string; name: string }> = {
  trigger: { icon: 'zap', tone: 'bg-chart-4', name: 'Trigger' },
  action: { icon: 'wrench', tone: 'bg-chart-1', name: 'Action' },
  ai: { icon: 'sparkles', tone: 'bg-chart-2', name: 'AI step' },
  condition: { icon: 'branch', tone: 'bg-chart-3', name: 'Condition' },
  output: { icon: 'mail', tone: 'bg-chart-5', name: 'Output' },
};

const wire = (a: WorkflowNode, b: { x: number; y: number }, toNode = true) => {
  const x1 = a.x + W;
  const y1 = a.y + H / 2;
  const x2 = b.x;
  const y2 = toNode ? b.y + H / 2 : b.y;
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

/** Nodes in an order where every wire runs forwards (ties by position). */
function order(nodes: readonly WorkflowNode[], edges: readonly WorkflowEdge[]) {
  const into = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) into.set(e.to, (into.get(e.to) ?? 0) + 1);
  const ready = nodes.filter((n) => !into.get(n.id)).sort((a, b) => a.x - b.x || a.y - b.y);
  const out: WorkflowNode[] = [];
  while (ready.length) {
    const n = ready.shift();
    if (!n) break;
    out.push(n);
    for (const e of edges.filter((x) => x.from === n.id)) {
      const left = (into.get(e.to) ?? 1) - 1;
      into.set(e.to, left);
      const t = nodes.find((x) => x.id === e.to);
      if (left === 0 && t) ready.push(t);
    }
  }
  return out.length === nodes.length ? out : [...nodes];
}

type Drag =
  | { kind: 'pan'; x0: number; y0: number; px: number; py: number }
  | { kind: 'node'; id: string; x0: number; y0: number; nx: number; ny: number }
  | { kind: 'wire'; from: string; x: number; y: number };

export function WorkflowCanvas({
  nodes,
  edges,
  label,
  onChange,
  fitOnStart = false,
  className,
}: WorkflowCanvasProps) {
  const [ns, setNs] = useState<WorkflowNode[]>(() => [...nodes]);
  const [es, setEs] = useState<WorkflowEdge[]>(() => [...edges]);
  const [view, setView] = useState({ x: 24, y: 24, k: 1 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [run, setRun] = useState<{
    done: Set<string>;
    active: string | null;
    beads: string[];
  } | null>(null);
  const [said, setSaid] = useState('');
  const [size, setSize] = useState({ w: 800, h: 420 });
  const box = useRef<HTMLDivElement>(null);
  const measured = useRef(false);
  const descId = useId();

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => {
      measured.current = true;
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toWorld = (cx: number, cy: number) => {
    const r = box.current?.getBoundingClientRect();
    return {
      x: (cx - (r?.left ?? 0) - view.x) / view.k,
      y: (cy - (r?.top ?? 0) - view.y) / view.k,
    };
  };
  const commit = (n: WorkflowNode[], e: WorkflowEdge[]) => {
    setNs(n);
    setEs(e);
    onChange?.(n, e);
  };

  const zoomBy = (f: number, cx?: number, cy?: number) =>
    setView((v) => {
      const k = Math.min(2, Math.max(0.4, v.k * f));
      const r = box.current?.getBoundingClientRect();
      const ox = cx === undefined ? (r?.width ?? 0) / 2 : cx - (r?.left ?? 0);
      const oy = cy === undefined ? (r?.height ?? 0) / 2 : cy - (r?.top ?? 0);
      return { k, x: ox - ((ox - v.x) * k) / v.k, y: oy - ((oy - v.y) * k) / v.k };
    });
  const fit = (most = 1.4) => {
    const xs = ns.map((n) => n.x);
    const ys = ns.map((n) => n.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const wW = Math.max(...xs) + W - minX;
    const wH = Math.max(...ys) + H - minY;
    const k = Math.min(most, Math.max(0.4, Math.min((size.w - 64) / wW, (size.h - 64) / wH)));
    setView({ k, x: (size.w - wW * k) / 2 - minX * k, y: (size.h - wH * k) / 2 - minY * k });
  };

  // the first real measurement (the ResizeObserver's) fits the flow once, if asked
  const fitted = useRef(false);
  const fitRef = useRef(fit);
  useEffect(() => {
    fitRef.current = fit;
  });
  useEffect(() => {
    // a canvas in a hidden tab measures 0 × 0 first: wait until it has a real box
    if (!fitOnStart || fitted.current || !measured.current || size.w < 120 || size.h < 120) return;
    fitted.current = true;
    fitRef.current(1);
  }, [fitOnStart, size]);

  // pinch or Ctrl/Cmd + wheel zooms about the pointer; a plain wheel still scrolls the page
  const zoomRef = useRef(zoomBy);
  useEffect(() => {
    zoomRef.current = zoomBy;
  });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = (e: globalThis.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomRef.current(Math.exp(-e.deltaY * 0.004), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, []);

  const down = (e: ReactPointerEvent<HTMLElement>, d: Drag) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    box.current?.setPointerCapture(e.pointerId);
    setDrag(d);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    if (drag.kind === 'pan')
      setView((v) => ({
        ...v,
        x: drag.px + e.clientX - drag.x0,
        y: drag.py + e.clientY - drag.y0,
      }));
    else if (drag.kind === 'node') {
      const dx = (e.clientX - drag.x0) / view.k;
      const dy = (e.clientY - drag.y0) / view.k;
      setNs((list) =>
        list.map((n) =>
          n.id === drag.id ? { ...n, x: Math.round(drag.nx + dx), y: Math.round(drag.ny + dy) } : n,
        ),
      );
    } else {
      const p = toWorld(e.clientX, e.clientY);
      setDrag({ ...drag, x: p.x, y: p.y });
    }
  };
  const onUp = () => {
    if (drag?.kind === 'node') onChange?.(ns, es);
    if (drag?.kind === 'wire') {
      const hit = ns.find(
        (n) => drag.x >= n.x && drag.x <= n.x + W && drag.y >= n.y && drag.y <= n.y + H,
      );
      if (hit && hit.id !== drag.from && !es.some((x) => x.from === drag.from && x.to === hit.id)) {
        commit(ns, [...es, { from: drag.from, to: hit.id }]);
        playSound('success');
        setSaid(`Wired ${ns.find((n) => n.id === drag.from)?.title} to ${hit.title}`);
      }
    }
    setDrag(null);
  };

  const nudge = (e: KeyboardEvent<HTMLButtonElement>, n: WorkflowNode) => {
    const step = e.shiftKey ? 48 : 12;
    const d = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[e.key];
    if (!d) return;
    e.preventDefault();
    const next = ns.map((x) =>
      x.id === n.id ? { ...x, x: x.x + (d[0] ?? 0), y: x.y + (d[1] ?? 0) } : x,
    );
    commit(next, es);
    setSaid(`Moved ${n.title}`);
  };

  const play = async () => {
    if (run) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const seq = order(ns, es);
    const done = new Set<string>();
    playSound('send');
    for (const n of seq) {
      const into = es
        .filter((x) => x.to === n.id && done.has(x.from))
        .map((x) => `${x.from}>${x.to}`);
      if (into.length && !reduce) {
        setRun({ done: new Set(done), active: null, beads: into });
        await new Promise((r) => setTimeout(r, 650));
      }
      setRun({ done: new Set(done), active: n.id, beads: [] });
      setSaid(`Running ${n.title}`);
      await new Promise((r) => setTimeout(r, 520));
      done.add(n.id);
      playSound('tick');
    }
    setRun({ done, active: null, beads: [] });
    setSaid('Run finished: every step succeeded');
    playSound('success');
    setTimeout(() => setRun(null), 2400);
  };

  const byId = new Map(ns.map((n) => [n.id, n]));
  const seq = order(ns, es);
  const mm = (() => {
    const xs = ns.flatMap((n) => [n.x, n.x + W]);
    const ys = ns.flatMap((n) => [n.y, n.y + H]);
    const minX = Math.min(...xs, -view.x / view.k) - 40;
    const minY = Math.min(...ys, -view.y / view.k) - 40;
    const maxX = Math.max(...xs, (size.w - view.x) / view.k) + 40;
    const maxY = Math.max(...ys, (size.h - view.y) / view.k) + 40;
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  })();

  return (
    <section
      aria-label={label}
      aria-describedby={descId}
      className={cn(
        'ui-workflow relative h-[26rem] w-full min-w-0 overflow-hidden rounded-xl border border-solid border-border bg-sunken font-sans [box-shadow:var(--elev-inset)]',
        className,
      )}
    >
      <p id={descId} className="sr-only">
        {`Steps in order: ${seq.map((n) => n.title).join(', then ')}. Arrow keys move a focused step.`}
      </p>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- panning and zooming are pointer extras; Fit and the zoom buttons do the same by keyboard */}
      <div
        ref={box}
        className={cn(
          'ui-workflow-plane absolute inset-0 touch-none',
          drag?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{
          backgroundSize: `${20 * view.k}px ${20 * view.k}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onPointerDown={(e) =>
          down(e, { kind: 'pan', x0: e.clientX, y0: e.clientY, px: view.x, py: view.y })
        }
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          <svg
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
            width="1"
            height="1"
            aria-hidden="true"
          >
            {es.map((e) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              const d = wire(a, b);
              const key = `${e.from}>${e.to}`;
              const lit =
                run?.done.has(e.from) &&
                (run.done.has(e.to) || run.active === e.to || run.beads.includes(key));
              return (
                <g key={key}>
                  <path
                    d={d}
                    className={cn(
                      'fill-none transition-[stroke] duration-(--dur-slow)',
                      lit ? 'stroke-brand' : 'stroke-border-strong',
                    )}
                    strokeWidth={2}
                  />
                  <path
                    d={d}
                    className={cn(
                      'ui-wire-flow fill-none stroke-brand',
                      lit ? 'opacity-60' : 'opacity-0',
                    )}
                    strokeWidth={2}
                    strokeDasharray="4 10"
                  />
                  {run?.beads.includes(key) && (
                    <circle r="5" className="ui-wire-bead fill-brand">
                      <animateMotion dur="0.65s" path={d} fill="freeze" />
                    </circle>
                  )}
                  {e.label && (
                    <text
                      x={(a.x + W + b.x) / 2}
                      y={(a.y + b.y) / 2 + H / 2 - 8}
                      textAnchor="middle"
                      className="fill-fg-muted font-sans text-[11px] font-medium"
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            {drag?.kind === 'wire' && byId.get(drag.from) && (
              <path
                d={wire(byId.get(drag.from) as WorkflowNode, { x: drag.x, y: drag.y }, false)}
                className="fill-none stroke-brand"
                strokeWidth={2}
                strokeDasharray="6 6"
              />
            )}
          </svg>
          {ns.map((n) => {
            const k = KIND[n.kind];
            const state = run?.active === n.id ? 'working' : run?.done.has(n.id) ? 'done' : 'idle';
            return (
              <div
                key={n.id}
                className="absolute"
                style={{ left: n.x, top: n.y, width: W, height: H }}
              >
                <button
                  type="button"
                  aria-label={`${k.name}: ${n.title}${n.detail ? `, ${n.detail}` : ''}${state === 'done' ? ', done' : state === 'working' ? ', running' : ''}`}
                  onPointerDown={(e) =>
                    down(e, {
                      kind: 'node',
                      id: n.id,
                      x0: e.clientX,
                      y0: e.clientY,
                      nx: n.x,
                      ny: n.y,
                    })
                  }
                  onKeyDown={(e) => nudge(e, n)}
                  data-state={state}
                  className={cn(
                    'ui-workflow-node group/node flex size-full cursor-move items-center gap-3 rounded-lg border border-solid border-border bg-surface px-3 text-start [box-shadow:var(--elev-2)] outline-none transition-[border-color,box-shadow,scale] duration-(--dur-base) ease-(--ease-out) glass-chrome hover:border-border-strong focus-visible:[box-shadow:var(--ring)] motion-reduce:transition-none',
                    state === 'working' && 'scale-[1.03] border-brand',
                    state === 'done' && 'border-success',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-fg',
                      k.tone,
                    )}
                  >
                    <span className="absolute inset-0 rounded-md bg-surface opacity-55" />
                    <Icon name={n.icon ?? k.icon} size={17} className="relative" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[10.5px] font-semibold tracking-wider text-fg-muted uppercase">
                      {k.name}
                    </span>
                    <span className="truncate text-[13px] font-semibold text-fg">{n.title}</span>
                    {n.detail && (
                      <span className="truncate text-[11.5px] text-fg-muted">{n.detail}</span>
                    )}
                  </span>
                  <span aria-hidden="true" className="absolute top-2 end-2">
                    {state === 'working' && (
                      <span className="ui-copilot-spin block size-3.5 rounded-full border-2 border-solid border-brand border-e-transparent" />
                    )}
                    {state === 'done' && (
                      <span className="ui-pop-in inline-flex size-4 items-center justify-center rounded-full bg-success text-on-success">
                        <Icon name="check" size={10} strokeWidth={3} />
                      </span>
                    )}
                  </span>
                </button>
                {n.kind !== 'trigger' && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 -start-1.5 size-3 -translate-y-1/2 rounded-full border-2 border-solid border-border-strong bg-surface"
                  />
                )}
                {n.kind !== 'output' && (
                  <span
                    aria-hidden="true"
                    onPointerDown={(e) => {
                      const p = toWorld(e.clientX, e.clientY);
                      down(e, { kind: 'wire', from: n.id, x: p.x, y: p.y });
                    }}
                    className="ui-workflow-port absolute top-1/2 -end-2 size-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-solid border-brand bg-surface transition-[scale] duration-(--dur-fast) hover:scale-125"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute top-3 start-3 flex items-center gap-1 rounded-lg border border-solid border-border bg-surface p-1 [box-shadow:var(--elev-2)] glass-chrome">
        <button
          type="button"
          onClick={() => zoomBy(1.2)}
          aria-label="Zoom in"
          className="ui-wf-tool"
        >
          <Icon name="zoom-in" size={16} />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.2)}
          aria-label="Zoom out"
          className="ui-wf-tool"
        >
          <Icon name="zoom-out" size={16} />
        </button>
        <button
          type="button"
          onClick={() => fit()}
          aria-label="Fit every step in view"
          className="ui-wf-tool"
        >
          <Icon name="maximize" size={16} />
        </button>
        <span className="min-w-11 px-1 text-center text-[11px] font-medium text-fg-muted tabular-nums">
          {Math.round(view.k * 100)}%
        </span>
      </div>
      <button
        type="button"
        onClick={play}
        disabled={!!run}
        className="absolute top-3 end-3 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-pill border-0 bg-primary px-4 text-[13px] font-semibold text-on-primary [box-shadow:var(--elev-2)] pointer-coarse:min-h-12 hover:bg-primary-hover focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] disabled:cursor-default disabled:opacity-80"
      >
        <Icon name={run ? 'clock' : 'play'} size={14} />
        {run ? (run.active ? 'Running…' : 'Done') : 'Run'}
      </button>

      <svg
        aria-hidden="true"
        viewBox={`${mm.minX} ${mm.minY} ${mm.w} ${mm.h}`}
        className="absolute end-3 bottom-3 h-20 w-32 rounded-md border border-solid border-border bg-surface [box-shadow:var(--elev-1)] glass-chrome"
        preserveAspectRatio="xMidYMid meet"
      >
        {ns.map((n) => (
          <rect
            key={n.id}
            x={n.x}
            y={n.y}
            width={W}
            height={H}
            rx={12}
            className={cn(run?.done.has(n.id) ? 'fill-success' : 'fill-fg-subtle')}
          />
        ))}
        <rect
          x={-view.x / view.k}
          y={-view.y / view.k}
          width={size.w / view.k}
          height={size.h / view.k}
          className="fill-brand-soft stroke-brand"
          strokeWidth={mm.w / 90}
          rx={8}
        />
      </svg>
    </section>
  );
}
