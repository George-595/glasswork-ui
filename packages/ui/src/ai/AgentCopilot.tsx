import { type AgentAction, type AgentComponent, createAgent } from '@ui-sdk/react/agent';
import { createHistory } from '@ui-sdk/react/history';
import { elementOf, type ObservedChange } from '@ui-sdk/react/observe';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Button } from '../components/button';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';
import { TextShimmer } from './TextShimmer';

/* AgentCopilot — an agent driving the page's real controls, where a person can watch it, on
   the UI SDK's agent bridge (@ui-sdk/react/agent). Every kit control built on the SDK (switch,
   slider, segmented control, tabs, toggle, menu, accordion, tree…) registers itself with the
   bridge, so the agent reads their labels and values and calls their own actions; the change
   goes through the control's normal callbacks with `source: "agent"`.

   What the person sees:
   - a glowing agent cursor that glides to each control before it is changed, and a ring that
     pulses round the control as it changes (both under reduced motion: no glide, no pulse);
   - each step as a line ("Set Night mode to on") that goes from waiting to working to done,
     or refused;
   - steps that `confirm` names wait for an inline Allow / Skip: the agent never changes those
     on its own (the bridge's `allow`);
   - "Undo the agent" puts back every value the agent changed and keeps what the person changed
     since (the SDK history's undoSource);
   - "Seen" lists what the person changed by hand since the last run, which is what an agent
     reads before its next turn (the bridge's subscribe);
   - "What it can see" opens the bridge's snapshot: each control, its value and its actions.

   The prompts are plans the app hands in (`plans`), or a function that turns a prompt into
   steps (`onPrompt`, where a model can plug in). Steps name controls by their label. */
export interface CopilotStep {
  /** The control's label (or a snapshot ref). */
  ref: string;
  action: string;
  args?: unknown[];
  /** What the line says: "Turn on Night mode". Default: built from the step. */
  say?: string;
}

export interface CopilotPlan {
  id: string;
  prompt: string;
  steps: readonly CopilotStep[];
}

export interface AgentCopilotProps {
  plans: readonly CopilotPlan[];
  /** Controls (by label) the agent must ask about first. */
  confirm?: readonly string[];
  /** The agent's name on its cursor. Default "Co-pilot". */
  name?: string;
  /** Milliseconds between steps, so a person can follow. Default 700. */
  pace?: number;
  /** A note under the prompts. */
  hint?: ReactNode;
  className?: string;
}

type LineState = 'waiting' | 'working' | 'asking' | 'done' | 'refused' | 'failed';
interface Line {
  id: string;
  text: string;
  state: LineState;
  note?: string;
}

type Bridge = ReturnType<typeof createAgent>;
let shared: { agent: Bridge; asks: Set<(a: AgentAction) => Promise<boolean>> } | null = null;

/** One bridge per page, made on first use in the browser. */
function bridge() {
  if (!shared) {
    const asks = new Set<(a: AgentAction) => Promise<boolean>>();
    const agent = createAgent({
      allow: async (step) => {
        for (const ask of asks) {
          const ok = await ask(step);
          if (!ok) return false;
        }
        return true;
      },
    });
    shared = { agent, asks };
  }
  return shared;
}

const sayOf = (s: CopilotStep) =>
  s.say ??
  (s.action === 'press'
    ? `Press ${s.ref}`
    : `Set ${s.ref} to ${s.args?.map((a) => (typeof a === 'boolean' ? (a ? 'on' : 'off') : String(a))).join(', ') ?? ''}`);

const same = (a?: string, b?: string) =>
  !!a && !!b && a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

function find(agent: Bridge, ref: string): AgentComponent | undefined {
  const all = agent.snapshot();
  return all.find((c) => c.ref === ref) ?? all.find((c) => same(c.label, ref));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AgentCopilot({
  plans,
  confirm = [],
  name = 'Co-pilot',
  pace = 700,
  hint,
  className,
}: AgentCopilotProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const [view, setView] = useState<AgentComponent[] | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; on: boolean } | null>(null);
  const [ring, setRing] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    k: number;
  } | null>(null);
  const [asking, setAsking] = useState<{ text: string; answer: (ok: boolean) => void } | null>(
    null,
  );
  const [canUndo, setCanUndo] = useState(false);
  const history = useRef<ReturnType<typeof createHistory> | null>(null);
  const confirmRef = useRef(confirm);
  useEffect(() => {
    confirmRef.current = confirm;
  });
  const allowRef = useRef<HTMLButtonElement>(null);
  // the question takes focus when it appears, so a keyboard user answers it straight away
  useEffect(() => {
    if (asking) allowRef.current?.focus();
  }, [asking]);
  const panelId = useId();

  // the bridge, its history and the person's changes, in the browser only
  useEffect(() => {
    const { agent, asks } = bridge();
    history.current = createHistory(agent);
    const ask = (a: AgentAction) => {
      if (!confirmRef.current.some((c) => same(c, a.label))) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        playSound('approval');
        setAsking({
          text: `${a.action === 'press' ? 'Press' : 'Change'} ${a.label ?? a.ref}?`,
          answer: (ok) => {
            setAsking(null);
            resolve(ok);
          },
        });
      });
    };
    asks.add(ask);
    const stop = agent.subscribe((c: ObservedChange) => {
      if (c.source === 'agent' || c.source === 'programmatic' || !c.label) return;
      const v = typeof c.value === 'boolean' ? (c.value ? 'on' : 'off') : String(c.value);
      setSeen((s) =>
        [
          `You set ${c.label} to ${v}`,
          ...s.filter((x) => !x.startsWith(`You set ${c.label} `)),
        ].slice(0, 4),
      );
    });
    return () => {
      asks.delete(ask);
      stop();
      history.current?.destroy();
    };
  }, []);

  const pointAt = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setCursor({ x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2, on: true });
    setRing((p) => ({
      x: r.left - 4,
      y: r.top - 4,
      w: r.width + 8,
      h: r.height + 8,
      k: (p?.k ?? 0) + 1,
    }));
  };

  const run = async (plan: CopilotPlan) => {
    if (busy) return;
    const { agent } = bridge();
    setBusy(true);
    setSeen([]);
    playSound('send');
    const fresh: Line[] = plan.steps.map((s, i) => ({
      id: `${plan.id}-${i}`,
      text: sayOf(s),
      state: 'waiting',
    }));
    setLines(fresh);
    const mark = (i: number, state: LineState, note?: string) =>
      setLines((ls) => ls.map((l, j) => (j === i ? { ...l, state, note } : l)));
    for (const [i, s] of plan.steps.entries()) {
      const target = find(agent, s.ref);
      if (!target) {
        mark(i, 'failed', 'Not on the page');
        continue;
      }
      try {
        const el = elementOf(target.ref);
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        await wait(120);
        pointAt(el);
      } catch {
        /* nothing to point at: the step still runs */
      }
      const needs = confirmRef.current.some((c) => same(c, target.label));
      mark(i, needs ? 'asking' : 'working');
      await wait(needs ? 0 : pace * 0.6);
      const res = await agent.act({
        steps: [{ ref: target.ref, action: s.action, args: s.args ? [...s.args] : undefined }],
      });
      if (res.ok) {
        mark(i, 'done');
        playSound('tick');
        setCanUndo(true);
      } else {
        const refused = /refus|not allowed|denied|allow/i.test(res.error?.message ?? '');
        mark(i, refused ? 'refused' : 'failed', refused ? 'You said no' : res.error?.message);
      }
      await wait(pace * 0.4);
    }
    setCursor((c) => (c ? { ...c, on: false } : c));
    setRing(null);
    setBusy(false);
    playSound('success');
  };

  const undo = async () => {
    await history.current?.undoSource('agent');
    setCanUndo(false);
    setLines((ls) => ls.map((l) => (l.state === 'done' ? { ...l, note: 'Put back' } : l)));
    playSound('close');
  };

  return (
    <section
      aria-labelledby={`${panelId}-t`}
      className={cn(
        'ui-copilot relative flex w-full min-w-0 flex-col gap-3 overflow-hidden rounded-xl border border-solid border-border bg-surface p-4 [box-shadow:var(--elev-2)] glass-chrome',
        className,
      )}
      data-busy={busy || undefined}
    >
      <span
        aria-hidden="true"
        className="ui-copilot-aura pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 transition-opacity duration-(--dur-slow) data-[on]:opacity-100"
        data-on={busy || undefined}
      />
      <header className="relative flex items-center gap-3">
        <span
          aria-hidden="true"
          className="ui-copilot-mark relative inline-flex size-9 items-center justify-center rounded-full bg-brand text-on-primary"
          data-on={busy || undefined}
        >
          <Icon name="sparkles" size={17} />
        </span>
        <div className="flex min-w-0 flex-col">
          <h3 id={`${panelId}-t`} className="m-0 font-sans text-[15px] font-semibold text-fg">
            {name}
          </h3>
          <p className="m-0 font-sans text-[12px] text-fg-muted" aria-live="polite">
            {busy ? (
              <TextShimmer>Working on the page…</TextShimmer>
            ) : (
              'Drives the controls on this page, where you can watch.'
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ms-auto"
          disabled={!canUndo || busy}
          onClick={undo}
        >
          <Icon name="undo" size={14} />
          Undo the agent
        </Button>
      </header>

      <fieldset className="relative m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
        <legend className="sr-only">Ask the agent</legend>
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={busy}
            onClick={() => run(p)}
            className="ui-copilot-prompt inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-pill border border-solid border-border bg-raised px-3.5 font-sans text-[13px] text-fg transition-[border-color,background-color,translate] duration-(--dur-fast) ease-(--ease-out) pointer-coarse:min-h-12 hover:-translate-y-px hover:border-brand focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] disabled:cursor-not-allowed disabled:text-disabled-fg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <Icon name="sparkles" size={13} className="text-brand" />
            {p.prompt}
          </button>
        ))}
      </fieldset>
      {hint && <p className="relative m-0 font-sans text-[12px] text-fg-muted">{hint}</p>}

      {lines.length > 0 && (
        <ol
          className="relative m-0 flex list-none flex-col gap-1 rounded-lg border border-solid border-border-subtle bg-sunken p-2"
          aria-label="What the agent did"
          aria-live="polite"
        >
          {lines.map((l) => (
            <li
              key={l.id}
              className="ui-copilot-line flex min-h-8 items-center gap-2.5 px-1.5 font-sans text-[13px]"
              data-state={l.state}
            >
              <span
                aria-hidden="true"
                className="inline-flex size-5 shrink-0 items-center justify-center"
              >
                {l.state === 'done' ? (
                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-success-soft text-success">
                    <Icon name="check" size={12} strokeWidth={3} />
                  </span>
                ) : l.state === 'refused' || l.state === 'failed' ? (
                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-danger-soft text-danger">
                    <Icon name="x" size={12} strokeWidth={3} />
                  </span>
                ) : l.state === 'working' || l.state === 'asking' ? (
                  <span className="ui-copilot-spin size-4 rounded-full border-2 border-solid border-brand border-e-transparent" />
                ) : (
                  <span className="size-1.5 rounded-full bg-fg-subtle" />
                )}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1',
                  l.state === 'waiting' ? 'text-fg-muted' : 'text-fg',
                )}
              >
                {l.state === 'working' ? <TextShimmer>{l.text}</TextShimmer> : l.text}
              </span>
              <span className="sr-only">
                {
                  {
                    waiting: 'waiting',
                    working: 'working',
                    asking: 'needs you',
                    done: 'done',
                    refused: 'refused',
                    failed: 'failed',
                  }[l.state]
                }
              </span>
              {l.note && <span className="shrink-0 text-[12px] text-fg-muted">{l.note}</span>}
            </li>
          ))}
        </ol>
      )}

      {asking && (
        <div
          role="alertdialog"
          aria-label="The agent asks first"
          className="ui-copilot-ask relative flex flex-wrap items-center gap-2 rounded-lg border border-solid border-warning bg-warning-soft p-2.5 ps-3 font-sans text-[13px] text-fg"
        >
          <Icon name="shield" size={15} />
          <span className="min-w-0 flex-1 font-medium">{asking.text}</span>
          <Button size="sm" variant="neutral" onClick={() => asking.answer(false)}>
            Skip
          </Button>
          <Button ref={allowRef} size="sm" variant="success" onClick={() => asking.answer(true)}>
            Allow
          </Button>
        </div>
      )}

      {seen.length > 0 && (
        <div className="relative flex flex-col gap-1">
          <span className="font-sans text-[11px] font-semibold tracking-wider text-fg-muted uppercase">
            Seen
          </span>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {seen.map((s) => (
              <li
                key={s}
                className="rounded-pill border border-solid border-border-subtle bg-raised px-2.5 py-0.5 font-sans text-[12px] text-fg-muted"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details
        className="ui-copilot-view relative font-sans text-[13px]"
        onToggle={(e) => setView(e.currentTarget.open ? bridge().agent.snapshot() : null)}
      >
        <summary className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-sm px-1 text-fg-muted marker:content-none pointer-coarse:min-h-12 hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]">
          <Icon name="eye" size={14} />
          What it can see
        </summary>
        {view && (
          <ul
            className="m-0 mt-2 flex max-h-56 list-none flex-col gap-1 overflow-auto p-0"
            {...{ tabIndex: 0 }}
          >
            {view
              .filter((c) => c.label && !c.offPage)
              .slice(0, 24)
              .map((c) => (
                <li
                  key={c.ref}
                  className="flex flex-wrap items-baseline gap-x-2 rounded-sm bg-sunken px-2 py-1 font-mono text-[11.5px]"
                >
                  <span className="text-fg-muted">{c.component}</span>
                  <span className="font-semibold text-fg">{c.label}</span>
                  {'value' in c && <span className="text-brand">= {String(c.value)}</span>}
                  {'checked' in c && <span className="text-brand">= {String(c.checked)}</span>}
                  <span className="ms-auto text-fg-subtle">{c.actions.join(' · ')}</span>
                </li>
              ))}
          </ul>
        )}
      </details>

      {/* the agent's cursor and the ring round its target: fixed to the viewport, for sight only */}
      {cursor && (
        <span
          aria-hidden="true"
          className="ui-agent-cursor pointer-events-none fixed top-0 left-0 z-[60] flex items-start gap-1 transition-[translate,opacity] duration-500 ease-(--ease-out) motion-reduce:transition-none"
          style={{ translate: `${cursor.x}px ${cursor.y}px`, opacity: cursor.on ? 1 : 0 }}
        >
          <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true">
            <path
              d="M1 1l15 8-6.5 1.8L6.5 18z"
              className="fill-brand stroke-on-primary"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </svg>
          <span className="mt-3 rounded-pill bg-brand px-2 py-0.5 font-sans text-[11px] font-semibold whitespace-nowrap text-on-primary [box-shadow:var(--elev-2)]">
            {name}
          </span>
        </span>
      )}
      {ring && (
        <span
          key={ring.k}
          aria-hidden="true"
          className="ui-agent-ring pointer-events-none fixed z-[59] rounded-lg"
          style={{ left: ring.x, top: ring.y, width: ring.w, height: ring.h }}
        />
      )}
    </section>
  );
}
