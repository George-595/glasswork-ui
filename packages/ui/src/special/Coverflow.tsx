import { type CSSProperties, type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* Coverflow — a shelf of covers to flick through (albums, case studies, templates, products):
   the one in front faces you, the rest turn away to either side in 3D, with a reflection on the
   floor. Drag or swipe and the shelf follows your finger, then springs to the nearest cover;
   press a side cover to bring it forward; the arrow keys and the scrubber step one at a time.

   Access: it is a carousel region; each cover is a button that says its title, subtitle and
   place ("3 of 8"), the front one is the single tab stop and is aria-current, arrows move focus
   with the shelf, and the scrubber is a real range input. Covers more than three away are not
   drawn and are hidden from assistive tech until the shelf reaches them. Under reduced motion the
   shelf moves without the turn. */
export interface CoverflowItem {
  id: string;
  title: string;
  subtitle?: string;
  /** A picture for the cover. Without one the cover is drawn from a chart colour (`tone`). */
  image?: string;
  alt?: string;
  tone?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Up to two words on a drawn cover, large. */
  mark?: string;
}

export interface CoverflowProps {
  items: readonly CoverflowItem[];
  label: string;
  defaultIndex?: number;
  /** The front cover was pressed (Enter, or a press on the front cover). */
  onSelect?: (item: CoverflowItem) => void;
  className?: string;
}

const STEP = 0.42; // of the cover width, between side covers
const DRAG = 160; // px of drag per cover

export function Coverflow({ items, label, defaultIndex = 0, onSelect, className }: CoverflowProps) {
  const [index, setIndex] = useState(Math.min(defaultIndex, Math.max(0, items.length - 1)));
  const [drag, setDrag] = useState(0);
  const grab = useRef<{ x: number; id: number; moved: boolean } | null>(null);
  const shelf = useRef<HTMLDivElement>(null);
  const last = items.length - 1;

  const go = (to: number, focus = false) => {
    const next = Math.max(0, Math.min(last, to));
    if (next !== index) playSound('tick');
    setIndex(next);
    if (focus) {
      requestAnimationFrame(() =>
        shelf.current?.querySelector<HTMLElement>(`[data-cover="${next}"]`)?.focus(),
      );
    }
  };
  const onKey = (e: KeyboardEvent) => {
    const to =
      e.key === 'ArrowRight'
        ? index + 1
        : e.key === 'ArrowLeft'
          ? index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (to === null) return;
    e.preventDefault();
    go(to, true);
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    grab.current = { x: e.clientX, id: e.pointerId, moved: false };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    if (!g.moved && Math.abs(dx) > 6) {
      g.moved = true;
      e.currentTarget.setPointerCapture(g.id);
    }
    if (g.moved) setDrag(Math.max(-index - 0.4, Math.min(last - index + 0.4, -dx / DRAG)));
  };
  const onUp = () => {
    const g = grab.current;
    grab.current = null;
    if (g?.moved) {
      go(Math.round(index + drag));
      setDrag(0);
    }
  };
  const pos = index + drag;
  const front = items[index];

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className={cn(
        'ui-coverflow flex w-full min-w-0 flex-col items-center gap-3 font-sans',
        className,
      )}
    >
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the drag surface is a pointer extra; the covers, buttons and scrubber are the controls */}
      <div
        ref={shelf}
        className="ui-coverflow-stage relative h-72 w-full touch-pan-y overflow-hidden select-none"
        data-dragging={drag !== 0 || undefined}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {items.map((it, i) => {
          const d = i - pos;
          const far = Math.abs(i - index) > 3;
          if (far) return null;
          const side = Math.sign(d);
          const ad = Math.min(Math.abs(d), 1);
          const x = d === 0 ? 0 : side * (ad * 62 + (Math.abs(d) - ad) * STEP * 100);
          const style = {
            '--cf-x': `${x}%`,
            '--cf-turn': `${-side * ad * 58}deg`,
            '--cf-z': `${-Math.abs(d) * 90 - ad * 60}px`,
            zIndex: 100 - Math.round(Math.abs(d) * 10),
          } as CSSProperties;
          const isFront = i === index;
          return (
            <button
              key={it.id}
              type="button"
              data-cover={i}
              data-front={isFront || undefined}
              tabIndex={isFront ? 0 : -1}
              onKeyDown={onKey}
              aria-current={isFront || undefined}
              aria-label={`${it.title}${it.subtitle ? `, ${it.subtitle}` : ''}, ${i + 1} of ${items.length}`}
              onClick={() => {
                if (grab.current?.moved) return;
                if (isFront) onSelect?.(it);
                else go(i, true);
              }}
              className="ui-cover absolute top-4 left-1/2 aspect-square w-52 cursor-pointer rounded-xl border-0 bg-transparent p-0 outline-none focus-visible:[box-shadow:var(--ring)]"
              style={style}
            >
              <Cover item={it} />
            </button>
          );
        })}
      </div>
      <div className="flex min-h-11 flex-col items-center text-center" aria-live="polite">
        <span key={front?.id} className="ui-coverflow-caption text-base font-semibold text-fg">
          {front?.title}
        </span>
        {front?.subtitle && (
          <span key={`${front.id}-s`} className="ui-coverflow-caption text-[13px] text-fg-muted">
            {front.subtitle}
          </span>
        )}
      </div>
      <div className="flex w-full max-w-sm items-center gap-2">
        <button
          type="button"
          aria-label="Previous cover"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-solid border-border bg-surface text-fg-muted outline-none pointer-coarse:size-12 hover:bg-hover hover:text-fg focus-visible:[box-shadow:var(--ring)] disabled:cursor-default disabled:opacity-40"
        >
          <Icon name="chevron-left" size={16} />
        </button>
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          aria-label={`${label}: cover`}
          aria-valuetext={`${front?.title ?? ''}, ${index + 1} of ${items.length}`}
          onChange={(e) => go(Number(e.target.value))}
          className="h-6 min-w-0 flex-1 cursor-pointer accent-brand pointer-coarse:h-12"
        />
        <button
          type="button"
          aria-label="Next cover"
          onClick={() => go(index + 1)}
          disabled={index === last}
          className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-solid border-border bg-surface text-fg-muted outline-none pointer-coarse:size-12 hover:bg-hover hover:text-fg focus-visible:[box-shadow:var(--ring)] disabled:cursor-default disabled:opacity-40"
        >
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
    </section>
  );
}

const TONE_BG = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
  6: 'bg-chart-6',
  7: 'bg-chart-7',
  8: 'bg-chart-8',
} as const;

function Cover({ item }: { item: CoverflowItem }) {
  return (
    <span className="ui-cover-face relative block size-full overflow-hidden rounded-xl [box-shadow:var(--elev-3)]">
      {item.image ? (
        <img src={item.image} alt="" draggable={false} className="block size-full object-cover" />
      ) : (
        <span
          className={cn(
            'ui-cover-drawn flex size-full flex-col justify-end p-4 text-left',
            TONE_BG[item.tone ?? 1],
          )}
        >
          <span className="ui-cover-shine" aria-hidden="true" />
          <span className="relative self-start rounded-md bg-surface-solid px-2.5 py-1 text-[22px]/[1.1] font-bold tracking-tight text-fg [box-shadow:var(--elev-1)]">
            {item.mark ?? item.title}
          </span>
        </span>
      )}
      <span className="ui-cover-sheen" aria-hidden="true" />
    </span>
  );
}
