import {
  type KeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useId,
  useRef,
  useState,
} from 'react';
import { useMinWidth } from '../components/layout/useMinWidth';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* Kanban — cards in columns that a person moves by dragging or by keyboard.

   Pointer: press a card and move it 4px to pick it up. It lifts off the board (a slight tilt, a
   deeper shadow) and follows the pointer; the cards in the column under it part to show where
   it will land; letting go drops it there, and Esc puts it back. The board scrolls sideways at
   its edges while a card is held.

   Keyboard (the WAI-ARIA practice for sortable lists): each card is a button. Space or Enter
   picks it up; Up/Down move it within its column, Left/Right to the next column; Space or
   Enter drops it; Esc puts it back where it was. Every move is said in a polite live region
   ("Picked up Fix login. Column To do, position 2 of 4."), and the instructions are the card's
   description.

   Columns have a `limit` (a WIP limit): the count turns amber at the limit and red over it,
   in words as well ("4 of 3, over the limit"). Cards carry a tag (one of the chart colours, with
   its name), an assignee's initials, a due date and a small progress bar.

   Phones (under 640px): no sideways board and no dragging. The columns become a row of stage
   buttons with their counts (wrapping, never scrolling) over one stage's cards, full width. Tap a
   card for a "Move to" row of the other stages; one tap moves it to the end of that stage. */
export interface KanbanCard {
  id: string;
  title: string;
  tag?: { label: string; tone: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 };
  assignee?: { initials: string; tone?: 1 | 2 | 3 | 4 | 5 | 6 };
  due?: string;
  /** 0 to 1. */
  progress?: number;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: readonly KanbanCard[];
  limit?: number;
}

export interface KanbanProps {
  columns: readonly KanbanColumn[];
  onChange?: (columns: KanbanColumn[]) => void;
  /** Names the board: "Sprint 14". */
  label: string;
  /** Renders under a column's cards (an "Add card" button). */
  columnFooter?: (column: KanbanColumn) => ReactNode;
  className?: string;
}

const TAG = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
  6: 'bg-chart-6',
  7: 'bg-chart-7',
  8: 'bg-chart-8',
} as const;
const AVATAR = {
  1: 'bg-avatar-1 border-avatar-1-edge',
  2: 'bg-avatar-2 border-avatar-2-edge',
  3: 'bg-avatar-3 border-avatar-3-edge',
  4: 'bg-avatar-4 border-avatar-4-edge',
  5: 'bg-avatar-5 border-avatar-5-edge',
  6: 'bg-avatar-6 border-avatar-6-edge',
} as const;

type Where = { col: number; index: number };

function move(cols: readonly KanbanColumn[], id: string, to: Where): KanbanColumn[] {
  let card: KanbanCard | undefined;
  const out = cols.map((c) => {
    const i = c.cards.findIndex((k) => k.id === id);
    if (i < 0) return { ...c, cards: [...c.cards] };
    card = c.cards[i];
    return { ...c, cards: c.cards.filter((k) => k.id !== id) };
  });
  if (!card) return out;
  const target = out[to.col];
  if (!target) return out;
  const cards = [...target.cards];
  cards.splice(Math.max(0, Math.min(to.index, cards.length)), 0, card);
  out[to.col] = { ...target, cards };
  return out;
}

function locate(cols: readonly KanbanColumn[], id: string): Where | null {
  for (const [col, c] of cols.entries()) {
    const index = c.cards.findIndex((k) => k.id === id);
    if (index >= 0) return { col, index };
  }
  return null;
}

function CardBody({ card }: { card: KanbanCard }) {
  return (
    <>
      {card.tag && (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-fg-muted">
          <span aria-hidden="true" className={cn('size-2 rounded-full', TAG[card.tag.tone])} />
          {card.tag.label}
        </span>
      )}
      <span className="text-[13.5px] leading-snug font-medium text-fg">{card.title}</span>
      {card.progress !== undefined && (
        <span aria-hidden="true" className="block h-1 overflow-hidden rounded-pill bg-sunken">
          <span
            className="block h-full rounded-pill bg-brand"
            style={{ width: `${Math.round(card.progress * 100)}%` }}
          />
        </span>
      )}
      {(card.assignee || card.due) && (
        <span className="flex items-center justify-between gap-2 text-[11.5px] text-fg-muted">
          {card.due ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="calendar" size={12} />
              {card.due}
            </span>
          ) : (
            <span />
          )}
          {card.assignee && (
            <span
              className={cn(
                'inline-flex size-6 items-center justify-center rounded-full border border-solid text-[10px] font-semibold text-fg',
                AVATAR[card.assignee.tone ?? 1],
              )}
            >
              {card.assignee.initials}
            </span>
          )}
        </span>
      )}
    </>
  );
}

export function Kanban({ columns, onChange, label, columnFooter, className }: KanbanProps) {
  const [inner, setInner] = useState<KanbanColumn[]>(() => [...columns]);
  // new columns from the app (a card added, a save) replace the board; compared by content, since
  // an app may build a fresh array on every render
  const signature = columns
    .map(
      (c) =>
        `${c.id}:${c.title}:${c.limit ?? ''}[${c.cards.map((k) => `${k.id}=${k.title}`).join(',')}]`,
    )
    .join('|');
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setInner([...columns]);
  }
  const wide = useMinWidth('sm');
  const [stage, setStage] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const cols = inner;
  const [said, setSaid] = useState('');
  const [held, setHeld] = useState<{ id: string; from: Where } | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    dx: number;
    dy: number;
    w: number;
    h: number;
    over: Where | null;
  } | null>(null);
  const press = useRef<{ id: string; x: number; y: number; el: HTMLElement } | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const helpId = useId();

  const commit = (next: KanbanColumn[]) => {
    setInner(next);
    onChange?.(next);
  };
  const titleOf = (id: string) =>
    cols.flatMap((c) => c.cards).find((c) => c.id === id)?.title ?? '';
  const describe = (w: Where, list = cols) =>
    `Column ${list[w.col]?.title}, position ${w.index + 1} of ${list[w.col]?.cards.length ?? 0}.`;

  /* ---- pointer ---- */
  const overAt = (x: number, y: number, id: string): Where | null => {
    const lists = board.current?.querySelectorAll<HTMLElement>('[data-kanban-list]') ?? [];
    for (const [col, list] of [...lists].entries()) {
      const r = list.getBoundingClientRect();
      if (x < r.left || x > r.right) continue;
      const cards = [...list.querySelectorAll<HTMLElement>('[data-card-id]')].filter(
        (el) => el.dataset.cardId !== id,
      );
      let index = cards.length;
      for (const [i, el] of cards.entries()) {
        const cr = el.getBoundingClientRect();
        if (y < cr.top + cr.height / 2) {
          index = i;
          break;
        }
      }
      return { col, index };
    }
    return null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0 || held) return;
    press.current = { id, x: e.clientX, y: e.clientY, el: e.currentTarget };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p) return;
    if (!drag) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 4) return;
      const r = p.el.getBoundingClientRect();
      p.el.setPointerCapture(e.pointerId);
      playSound('tick');
      setDrag({
        id: p.id,
        x: e.clientX,
        y: e.clientY,
        dx: p.x - r.left,
        dy: p.y - r.top,
        w: r.width,
        h: r.height,
        over: locate(cols, p.id),
      });
      return;
    }
    // scroll the board at its edges
    const b = board.current;
    if (b) {
      const r = b.getBoundingClientRect();
      if (e.clientX > r.right - 48) b.scrollLeft += 12;
      else if (e.clientX < r.left + 48) b.scrollLeft -= 12;
    }
    setDrag({
      ...drag,
      x: e.clientX,
      y: e.clientY,
      over: overAt(e.clientX, e.clientY, drag.id) ?? drag.over,
    });
  };
  const onPointerUp = () => {
    const d = drag;
    press.current = null;
    if (!d) return;
    setDrag(null);
    if (d.over) {
      const next = move(cols, d.id, d.over);
      commit(next);
      setSaid(`Dropped ${titleOf(d.id)}. ${describe(d.over, next)}`);
      playSound('success');
    }
  };

  /* ---- keyboard ---- */
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const at = locate(cols, id);
    if (!at) return;
    if (!held) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setHeld({ id, from: at });
        setSaid(
          `Picked up ${titleOf(id)}. ${describe(at)} Arrow keys move it, Space drops it, Escape cancels.`,
        );
        playSound('tick');
      }
      return;
    }
    if (held.id !== id) return;
    let to: Where | null = null;
    if (e.key === 'ArrowUp') to = { col: at.col, index: Math.max(0, at.index - 1) };
    else if (e.key === 'ArrowDown')
      to = { col: at.col, index: Math.min((cols[at.col]?.cards.length ?? 1) - 1, at.index + 1) };
    else if (e.key === 'ArrowLeft' && at.col > 0)
      to = { col: at.col - 1, index: Math.min(at.index, cols[at.col - 1]?.cards.length ?? 0) };
    else if (e.key === 'ArrowRight' && at.col < cols.length - 1)
      to = { col: at.col + 1, index: Math.min(at.index, cols[at.col + 1]?.cards.length ?? 0) };
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setHeld(null);
      setSaid(`Dropped ${titleOf(id)}. ${describe(at)}`);
      onChange?.(cols);
      playSound('success');
      return;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      const back = move(cols, id, held.from);
      setInner(back);
      setHeld(null);
      setSaid(`Put ${titleOf(id)} back. ${describe(held.from, back)}`);
      return;
    }
    if (to) {
      e.preventDefault();
      const next = move(cols, id, to);
      setInner(next);
      setSaid(describe(to, next));
      requestAnimationFrame(() =>
        board.current?.querySelector<HTMLButtonElement>(`[data-card-id="${id}"]`)?.focus(),
      );
    }
  };

  const dragged = drag ? cols.flatMap((c) => c.cards).find((c) => c.id === drag.id) : undefined;

  if (!wide) {
    const ci = Math.min(stage, cols.length - 1);
    const col = cols[ci];
    const moveTo = (id: string, to: number) => {
      const next = move(cols, id, { col: to, index: cols[to]?.cards.length ?? 0 });
      commit(next);
      setPicked(null);
      setSaid(`Moved ${titleOf(id)} to ${cols[to]?.title}.`);
      playSound('success');
    };
    return (
      <section
        aria-label={label}
        className={cn('ui-kanban flex w-full min-w-0 flex-col gap-3 font-sans', className)}
      >
        <p className="sr-only" aria-live="polite">
          {said}
        </p>
        {/* biome-ignore lint/a11y/useSemanticElements: a row of buttons, not a form */}
        <div role="group" aria-label="Stage" className="ui-kanban-stages flex flex-wrap gap-1.5">
          {cols.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={i === ci}
              onClick={() => {
                setStage(i);
                setPicked(null);
              }}
              className={cn(
                'inline-flex min-h-10 pointer-coarse:min-h-12 cursor-pointer items-center gap-1.5 rounded-pill border border-solid px-3 text-[13px] font-semibold outline-none focus-visible:[box-shadow:var(--ring)]',
                i === ci
                  ? 'border-brand bg-brand-soft text-fg'
                  : 'border-border bg-surface text-fg-muted hover:bg-hover glass-chrome',
              )}
            >
              {c.title}
              <span className="rounded-pill bg-raised px-1.5 text-[11px] leading-[18px] tabular-nums text-fg-muted">
                {c.limit !== undefined ? `${c.cards.length}/${c.limit}` : c.cards.length}
              </span>
            </button>
          ))}
        </div>
        {col && (
          <div className="ui-kanban-col flex flex-col gap-2 rounded-xl border border-solid border-border-subtle bg-sunken p-2 glass:bg-surface glass-chrome">
            {col.cards.length === 0 && (
              <p className="m-0 px-2 py-4 text-center text-[13px] text-fg-muted">
                Nothing in {col.title}.
              </p>
            )}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {col.cards.map((card) => (
                <li key={card.id} className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    aria-expanded={onChange ? picked === card.id : undefined}
                    disabled={!onChange}
                    onClick={() => setPicked((p) => (p === card.id ? null : card.id))}
                    className={cn(
                      'ui-kanban-card flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-solid border-border bg-surface p-3 text-start [box-shadow:var(--elev-1)] outline-none focus-visible:[box-shadow:var(--ring)] disabled:cursor-default',
                      picked === card.id && 'border-brand',
                    )}
                  >
                    <CardBody card={card} />
                  </button>
                  {picked === card.id && (
                    // biome-ignore lint/a11y/useSemanticElements: a row of buttons, not a form
                    <div
                      role="group"
                      aria-label={`Move ${card.title} to`}
                      className="flex flex-wrap items-center gap-1.5 px-1"
                    >
                      <span className="text-[12px] font-medium text-fg-muted">Move to</span>
                      {cols.map((c, i) =>
                        i === ci ? null : (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => moveTo(card.id, i)}
                            className="inline-flex min-h-9 pointer-coarse:min-h-12 cursor-pointer items-center rounded-pill border border-solid border-border bg-surface px-3 text-[13px] font-medium text-fg outline-none hover:bg-hover focus-visible:[box-shadow:var(--ring)]"
                          >
                            {c.title}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {columnFooter?.(col)}
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label={label}
      className={cn('ui-kanban relative w-full min-w-0 font-sans', className)}
    >
      <p id={helpId} className="sr-only">
        Press Space to pick a card up, the arrow keys to move it, Space to drop it and Escape to
        cancel.
      </p>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      <div ref={board} className="ui-kanban-board relative flex snap-x gap-3 overflow-x-auto pb-2">
        {cols.map((col, ci) => {
          const n = col.cards.length;
          const over = col.limit !== undefined && n > col.limit;
          const at = col.limit !== undefined && n === col.limit;
          const placeholderAt = drag?.over?.col === ci ? drag.over.index : -1;
          let shown = 0;
          return (
            <div
              key={col.id}
              className={cn(
                'ui-kanban-col flex w-72 shrink-0 snap-start flex-col gap-2 rounded-xl border border-solid border-border-subtle bg-sunken p-2 transition-[background-color,border-color] duration-(--dur-fast) glass:bg-surface glass-chrome',
                drag?.over?.col === ci && 'border-brand',
              )}
            >
              <h3 className="m-0 flex min-h-8 items-center gap-2 px-1.5 text-[13px] font-semibold text-fg">
                {col.title}
                <span
                  className={cn(
                    'rounded-pill px-1.5 text-[11px] leading-[18px] font-semibold tabular-nums',
                    over
                      ? 'bg-danger-soft text-fg'
                      : at
                        ? 'bg-warning-soft text-fg'
                        : 'bg-raised text-fg-muted',
                  )}
                >
                  {col.limit !== undefined ? `${n}/${col.limit}` : n}
                  <span className="sr-only">
                    {' '}
                    cards
                    {col.limit !== undefined
                      ? `, limit ${col.limit}${over ? ', over the limit' : ''}`
                      : ''}
                  </span>
                </span>
              </h3>
              <ul data-kanban-list="" className="m-0 flex min-h-16 list-none flex-col gap-2 p-0">
                {col.cards.map((card) => {
                  const isDrag = drag?.id === card.id;
                  const before = !isDrag && placeholderAt === shown;
                  if (!isDrag) shown++;
                  return [
                    before && (
                      <li
                        key={`ph-${card.id}`}
                        aria-hidden="true"
                        className="ui-kanban-ph rounded-lg border-2 border-dashed border-brand bg-brand-soft"
                        style={{ height: drag?.h }}
                      />
                    ),
                    <li
                      key={card.id}
                      className={cn(isDrag && 'pointer-events-none absolute opacity-0')}
                    >
                      <button
                        type="button"
                        data-card-id={card.id}
                        aria-describedby={helpId}
                        aria-pressed={held?.id === card.id}
                        onPointerDown={(e) => onPointerDown(e, card.id)}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        onKeyDown={(e) => onKeyDown(e, card.id)}
                        onBlur={() => held?.id === card.id && setHeld(null)}
                        className={cn(
                          'ui-kanban-card flex w-full cursor-grab touch-none flex-col gap-2 rounded-lg border border-solid border-border bg-surface p-3 text-start [box-shadow:var(--elev-1)] transition-[box-shadow,translate,border-color,rotate] duration-(--dur-fast) ease-(--ease-out) hover:-translate-y-px hover:border-border-strong hover:[box-shadow:var(--elev-2)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] active:cursor-grabbing motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                          held?.id === card.id &&
                            'rotate-1 border-brand [box-shadow:var(--elev-3)] motion-reduce:rotate-0',
                        )}
                      >
                        <CardBody card={card} />
                      </button>
                    </li>,
                  ];
                })}
                {placeholderAt >= shown && (
                  <li
                    aria-hidden="true"
                    className="ui-kanban-ph rounded-lg border-2 border-dashed border-brand bg-brand-soft"
                    style={{ height: drag?.h }}
                  />
                )}
              </ul>
              {columnFooter?.(col)}
            </div>
          );
        })}
      </div>
      {drag && dragged && (
        <div
          aria-hidden="true"
          className="ui-kanban-ghost pointer-events-none fixed top-0 left-0 z-[70] flex flex-col gap-2 rounded-lg border border-solid border-brand bg-surface p-3 [box-shadow:var(--elev-3)] glass-chrome"
          style={{ width: drag.w, translate: `${drag.x - drag.dx}px ${drag.y - drag.dy}px` }}
        >
          <CardBody card={dragged} />
        </div>
      )}
    </section>
  );
}
