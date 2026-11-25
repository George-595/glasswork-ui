import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useLiquidGlass } from '../glass/LiquidGlass';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';
import { TabsContent, TabsList, Tabs as TabsRoot, TabsTrigger } from './ui/tabs';

/* Tabs — the WAI-ARIA tabs pattern with automatic activation, on Vercel's UI
   SDK tabs. Left/Right move and select (wrapping), Home/End jump to the
   ends. The selected tab is the one tab stop (roving tabindex). Every panel
   stays rendered (`keepMounted`) and the inactive ones are `hidden`, so
   aria-controls always points at a real element and panel state survives a
   switch. A panel is focusable (APG), so content without controls is
   reachable.

   In the glass skin the tab list is a LiquidGlass track with a glass pill
   on the active tab. The pill slides from tab to tab (measured, transform
   only; still under reduced motion; until it is measured the active tab
   paints its own fill). When the tabs are wider than their space the list
   scrolls, the cut edge fades, and arrow buttons appear at the ends for a
   mouse (the keyboard already has the arrow keys, which bring the tab into
   view, so the buttons are skipped by Tab and hidden from assistive tech). Controlled with `value` + onValueChange, or
   uncontrolled with defaultValue. */
export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  tabs: readonly TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Names the tab list for assistive tech. */
  label: string;
  className?: string;
}

export function Tabs({ tabs, value, defaultValue, onValueChange, label, className }: TabsProps) {
  const [inner, setInner] = useState(defaultValue ?? tabs[0]?.id ?? '');
  const current = value ?? inner;
  const {
    ref: glassRef,
    props: glassProps,
    layers: glassLayers,
  } = useLiquidGlass<HTMLDivElement>({
    fill: 'surface',
    band: 6,
    refraction: 12,
  });

  const listRef = useRef<HTMLDivElement | null>(null);
  const setListRef = useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      glassRef(node);
    },
    [glassRef],
  );
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  // measure the selected tab and the overflow; again whenever the list resizes or scrolls
  // biome-ignore lint/correctness/useExhaustiveDependencies: the DOM, not a value, is read; re-measure when the selected tab or the tabs change
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const on = list.querySelector<HTMLElement>('[data-selected]');
      setPill((prev) =>
        !on
          ? null
          : prev && prev.x === on.offsetLeft && prev.w === on.offsetWidth
            ? prev
            : { x: on.offsetLeft, w: on.offsetWidth },
      );
      const start = list.scrollLeft > 1;
      const end = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    measure();
    list.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(list);
    return () => {
      list.removeEventListener('scroll', measure);
      ro?.disconnect();
    };
  }, [current, tabs]);

  const nudge = (dir: 1 | -1) => {
    const list = listRef.current;
    if (!list) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    list.scrollBy({ left: dir * list.clientWidth * 0.7, behavior: reduce ? 'auto' : 'smooth' });
  };

  const select = (id: string) => {
    if (id !== current) playSound('tick');
    if (value === undefined) setInner(id);
    onValueChange?.(id);
  };

  return (
    <TabsRoot
      value={current}
      onValueChange={(id) => id !== null && select(id)}
      activation="automatic"
      loop
      className={cn('ui-tabs flex flex-col', className)}
    >
      <div className="ui-tabs-bar relative flex max-w-full self-start">
        <TabsList
          ref={setListRef}
          aria-label={label}
          data-ready={pill ? '' : undefined}
          data-overflow-start={edges.start ? '' : undefined}
          data-overflow-end={edges.end ? '' : undefined}
          className={cn(
            'ui-tablist group/tabs relative [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            'data-overflow-start:[mask-image:linear-gradient(to_right,transparent,currentColor_2.5rem)] data-overflow-end:[mask-image:linear-gradient(to_left,transparent,currentColor_2.5rem)]',
            'data-overflow-start:data-overflow-end:[mask-image:linear-gradient(to_right,transparent,currentColor_2.5rem,currentColor_calc(100%-2.5rem),transparent)]',
            glassProps.className,
          )}
          data-lg={glassProps['data-lg']}
          style={
            {
              ...glassProps.style,
              '--tab-x': `${pill?.x ?? 0}px`,
              '--tab-w': `${pill?.w ?? 0}px`,
            } as CSSProperties
          }
        >
          {glassLayers}
          {pill && (
            <span
              aria-hidden="true"
              className={cn(
                'ui-tab-pill pointer-events-none absolute top-[3px] bottom-[3px] left-0 rounded-md border border-solid border-brand bg-selected',
                '[translate:var(--tab-x)_0] w-(--tab-w)',
                'transition-[translate,width] duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none',
                'forced-colors:[outline:2px_solid_Highlight]',
              )}
            />
          )}
          {tabs.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="ui-tab relative z-[1] group-data-[ready]/tabs:data-selected:border-transparent group-data-[ready]/tabs:data-selected:bg-transparent"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {edges.start && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => nudge(-1)}
            className={SCROLL_BUTTON}
            data-edge="start"
          >
            <Icon name="chevron-left" size={14} />
          </button>
        )}
        {edges.end && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => nudge(1)}
            className={cn(SCROLL_BUTTON, 'end-0.5')}
            data-edge="end"
          >
            <Icon name="chevron-right" size={14} />
          </button>
        )}
      </div>
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id} keepMounted tabIndex={0} className="ui-tabpanel">
          {t.content}
        </TabsContent>
      ))}
    </TabsRoot>
  );
}

const SCROLL_BUTTON =
  'ui-tabs-scroll absolute start-0.5 top-1/2 z-[2] inline-grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-solid border-border bg-surface-solid p-0 text-fg-muted [box-shadow:var(--elev-1)] hover:text-fg data-[edge=end]:start-auto';
