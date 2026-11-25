import { type PointerEvent, type ReactNode, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* FrostReveal — something private kept under frosted glass until you want it: a balance, an API
   key, a spoiler, a test answer. Wipe the glass with a finger or the pointer and it clears where
   you touched, like a misted window; once most of it is clear the rest melts away. "Show" clears
   it at once, and "Hide" frosts it over again.

   The frost is a backdrop blur, and the wiped holes are a stack of radial-gradient masks (no
   canvas), so it is sharp at any zoom and costs nothing at rest.

   Access: while frosted the content is inert and hidden from assistive tech, and the only control
   is a "Show <label>" button, so nobody hears it by accident; once shown, the content is plain
   content and focus moves to it. Reduced motion skips the melt. */
export interface FrostRevealProps {
  /** Names what is hidden: "Account balance". */
  label: string;
  children: ReactNode;
  /** The words on the glass. */
  hint?: string;
  className?: string;
}

const BRUSH = 26;
const GRID = 8;

export function FrostReveal({
  label,
  children,
  hint = 'Wipe to reveal',
  className,
}: FrostRevealProps) {
  const [shown, setShown] = useState(false);
  const [holes, setHoles] = useState<readonly { x: number; y: number }[]>([]);
  const touched = useRef(new Set<number>());
  const wiping = useRef(false);
  const content = useRef<HTMLDivElement>(null);

  const reveal = (focus: boolean) => {
    setShown(true);
    playSound('success');
    if (focus) requestAnimationFrame(() => content.current?.focus());
  };
  const hide = () => {
    setShown(false);
    setHoles([]);
    touched.current.clear();
  };
  const wipe = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    setHoles((h) => {
      const prev = h[h.length - 1];
      if (prev && Math.hypot(prev.x - x, prev.y - y) < BRUSH * 0.45) return h;
      return [...h, { x, y }].slice(-160);
    });
    const cell =
      Math.min(GRID - 1, Math.floor((x / box.width) * GRID)) * GRID +
      Math.min(GRID - 1, Math.floor((y / box.height) * GRID));
    touched.current.add(cell);
    if (touched.current.size > GRID * GRID * 0.5) reveal(false);
  };

  const mask = holes.length
    ? holes
        .map(
          (p) =>
            `radial-gradient(circle at ${p.x.toFixed(0)}px ${p.y.toFixed(0)}px, transparent ${BRUSH * 0.6}px, currentColor ${BRUSH}px)`,
        )
        .join(',')
    : undefined;

  return (
    <div
      className={cn(
        'ui-frost relative isolate min-w-0 overflow-hidden rounded-xl border border-solid border-border',
        className,
      )}
    >
      <div
        ref={content}
        tabIndex={shown ? -1 : undefined}
        inert={!shown}
        aria-hidden={!shown || undefined}
        className="min-h-32 p-4 outline-none"
      >
        {children}
      </div>
      {!shown ? (
        <div
          className="ui-frost-glass absolute inset-0 z-10 grid touch-none place-items-center text-fg"
          style={
            mask
              ? {
                  maskImage: mask,
                  WebkitMaskImage: mask,
                  maskComposite: 'intersect',
                  WebkitMaskComposite: 'source-in',
                }
              : undefined
          }
          onPointerDown={(e) => {
            wiping.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            wipe(e);
          }}
          onPointerMove={(e) => {
            if (wiping.current || e.pointerType === 'mouse') wipe(e);
          }}
          onPointerUp={() => {
            wiping.current = false;
          }}
        >
          <span className="ui-frost-grain" aria-hidden="true" />
          <span className="relative flex flex-col items-center gap-2 text-center">
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
              <Icon name="eye-off" size={14} />
              {hint}
            </span>
            <button
              type="button"
              onClick={() => reveal(true)}
              className="min-h-9 cursor-pointer rounded-pill border border-solid border-border bg-surface-solid px-4 text-[13px] font-semibold text-fg outline-none [box-shadow:var(--elev-1)] pointer-coarse:min-h-12 hover:bg-hover focus-visible:[box-shadow:var(--ring)]"
            >
              Show {label.toLowerCase()}
            </button>
          </span>
        </div>
      ) : (
        <span
          className="ui-frost-melt pointer-events-none absolute inset-0 z-10"
          aria-hidden="true"
        />
      )}
      {shown && (
        <button
          type="button"
          onClick={hide}
          aria-label={`Hide ${label.toLowerCase()}`}
          className="absolute top-2 right-2 z-20 inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-solid border-border bg-surface-solid text-fg-muted outline-none pointer-coarse:size-12 hover:text-fg focus-visible:[box-shadow:var(--ring)]"
        >
          <Icon name="eye-off" size={14} />
        </button>
      )}
    </div>
  );
}
