import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* LiveIsland — the thing happening right now, in a pill at the top of the screen: a deploy, a
   call, a timer, an upload. Small, it shows an icon, a few words and a progress ring; pressed, it
   grows into a card with the detail, a progress bar and actions, and shrinks back on Escape or a
   second press. When two things run at once the pill splits, the second shown as a bubble that
   swaps in when pressed.

   The size change is a measured spring (the box animates between the two real sizes of its
   content, so it never clips or jumps), the content cross-fades, and with reduced motion it just
   changes. The pill is a button with aria-expanded; a polite live region says when an activity
   starts, finishes or changes step. */
export interface IslandActivity {
  id: string;
  icon: IconName;
  title: string;
  /** A line under the title in the open card: "Building the client · step 3 of 5". */
  detail?: string;
  /** 0 to 1: a ring when small, a bar when open. */
  progress?: number;
  /** Short text at the end of the pill: "2:14", "42%". */
  trailing?: string;
  tone?: 'brand' | 'success' | 'danger' | 'warning';
  actions?: readonly { label: string; onSelect: () => void }[];
}

export interface LiveIslandProps {
  activities: readonly IslandActivity[];
  label?: string;
  defaultExpanded?: boolean;
  className?: string;
}

const TONE = {
  brand: 'text-brand',
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
} as const;
const BAR = {
  brand: 'bg-brand',
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
} as const;

export function LiveIsland({
  activities,
  label = 'Live activity',
  defaultExpanded = false,
  className,
}: LiveIslandProps) {
  const [open, setOpen] = useState(defaultExpanded);
  const [lead, setLead] = useState<string | null>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  const main = activities.find((a) => a.id === lead) ?? activities[0];
  const other = activities.find((a) => a !== main);
  const tone = main?.tone ?? 'brand';

  // measure the content each time it changes size; the outer box springs to it
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = () => setBox({ w: el.offsetWidth, h: el.offsetHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // a new activity, a new step, or the end of one is announced by the status line
  const said = main ? `${main.title}${main.detail ? `. ${main.detail}` : ''}` : '';

  // Escape inside the open card closes it
  const shell = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = shell.current;
    if (!el || !open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [open]);

  if (!main) return null;
  const toggle = () => {
    setOpen((o) => !o);
    playSound(open ? 'close' : 'open');
  };
  const pct = main.progress === undefined ? null : Math.max(0, Math.min(1, main.progress));

  return (
    <div className={cn('ui-island flex items-start justify-center gap-2 font-sans', className)}>
      <section
        ref={shell}
        aria-label={label}
        className="ui-island-shell overflow-hidden rounded-[28px] bg-fg text-surface-solid [box-shadow:var(--elev-3)]"
        data-open={open || undefined}
        style={box && box.w > 0 ? { width: box.w, height: box.h } : undefined}
      >
        <div ref={inner} className={cn('w-max', open ? 'p-4' : 'p-1.5')}>
          <button
            type="button"
            aria-expanded={open}
            onClick={toggle}
            className={cn(
              'ui-island-head flex w-full cursor-pointer items-center gap-2.5 rounded-pill border-0 bg-transparent text-left text-inherit outline-none focus-visible:[box-shadow:var(--ring)]',
              open
                ? 'min-w-72 pe-1 pointer-coarse:min-h-12'
                : 'min-h-9 max-w-72 ps-1.5 pe-3 pointer-coarse:min-h-12',
            )}
          >
            <span
              className={cn(
                'relative grid shrink-0 place-items-center rounded-full',
                open ? 'size-10 bg-surface-solid' : 'size-7',
                TONE[tone],
              )}
            >
              {pct !== null && !open && <Ring value={pct} />}
              <Icon name={main.icon} size={open ? 18 : 14} strokeWidth={2.4} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn('truncate font-semibold', open ? 'text-[15px]' : 'text-[13px]')}>
                {main.title}
              </span>
              {open && main.detail && (
                <span className="ui-island-fade truncate text-[13px] opacity-75">
                  {main.detail}
                </span>
              )}
            </span>
            {main.trailing && (
              <span
                className={cn(
                  'shrink-0 font-semibold tabular-nums',
                  open ? 'text-[15px]' : 'text-[13px]',
                )}
              >
                {main.trailing}
              </span>
            )}
            <span className="sr-only">{open ? ', hide details' : ', show details'}</span>
          </button>
          {open && (
            <div className="ui-island-fade mt-3 flex flex-col gap-3">
              {pct !== null && (
                <span
                  className="relative block h-1.5 overflow-hidden rounded-pill"
                  role="progressbar"
                  aria-label={`${main.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pct * 100)}
                >
                  <span className="absolute inset-0 bg-surface-solid opacity-25" />
                  <span
                    className={cn(
                      'relative block h-full rounded-pill transition-[width] duration-(--dur-slow) ease-(--ease-out)',
                      BAR[tone],
                    )}
                    style={{ width: `${pct * 100}%` }}
                  />
                </span>
              )}
              {main.actions && main.actions.length > 0 && (
                <div className="flex gap-2">
                  {main.actions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={a.onSelect}
                      className="min-h-9 flex-1 cursor-pointer rounded-pill border-0 bg-surface-solid px-4 text-[13px] font-semibold text-fg outline-none pointer-coarse:min-h-12 hover:bg-hover focus-visible:[box-shadow:var(--ring)]"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
      {other && !open && (
        <button
          type="button"
          onClick={() => {
            setLead(other.id);
            playSound('tick');
          }}
          aria-label={`Show ${other.title}`}
          className={cn(
            'ui-island-bubble relative grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-fg outline-none [box-shadow:var(--elev-3)] focus-visible:[box-shadow:var(--ring)]',
            TONE[other.tone ?? 'brand'],
          )}
        >
          {other.progress !== undefined && <Ring value={other.progress} />}
          <Icon name={other.icon} size={16} strokeWidth={2.4} />
        </button>
      )}
      <span role="status" className="sr-only">
        {said}
      </span>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 12;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 28 28" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeWidth={2.5}
      />
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        className="transition-[stroke-dashoffset] duration-(--dur-slow)"
      />
    </svg>
  );
}
