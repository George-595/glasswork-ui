import {
  AccordionHeader,
  AccordionItem as AccordionItemPart,
  AccordionPanel,
  Accordion as AccordionRoot,
  AccordionTrigger,
} from '@ui-sdk/react/accordion';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* Accordion — sections that open from their headings, on Vercel's UI SDK accordion
   (@ui-sdk/react/accordion): each heading is a real <h3> holding a button with
   aria-expanded/aria-controls; Up/Down move between headings, Home/End jump to the ends.

   The look: each section is a card that lifts when open (raised fill, a soft shadow, a
   brand-coloured edge on the leading side), the chevron turns, and the panel grows from
   its measured height (`--accordion-panel-height`), then fades its content in. Under
   reduced motion the panel snaps open. `multiple` lets several open at once (default
   one); `collapsible` lets the open one close (default true). `meta` is a short note on
   the heading's far side ("3 steps", "Updated today"); `icon` sits on the near side.
   Content stays mounted while closed (`keepMounted`), as `hidden="until-found"`, so the
   browser's find in page reaches it and opens the section. */
export interface AccordionSection {
  id: string;
  title: ReactNode;
  content: ReactNode;
  icon?: IconName;
  meta?: ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  items: readonly AccordionSection[];
  multiple?: boolean;
  defaultValue?: readonly string[];
  value?: readonly string[];
  onValueChange?: (value: string[]) => void;
  /** `cards` (default): each section is its own card. `flush`: one card, rules between. */
  variant?: 'cards' | 'flush';
  className?: string;
}

export function Accordion({
  items,
  multiple = false,
  defaultValue,
  value,
  onValueChange,
  variant = 'cards',
  className,
}: AccordionProps) {
  const flush = variant === 'flush';
  return (
    <AccordionRoot
      multiple={multiple}
      defaultValue={defaultValue ? [...defaultValue] : undefined}
      value={value ? [...value] : undefined}
      onValueChange={(v) => {
        playSound('tick');
        onValueChange?.(v.map(String));
      }}
      collapsible
      hiddenUntilFound
      className={cn(
        'ui-accordion flex w-full min-w-0 flex-col',
        flush
          ? 'overflow-hidden rounded-lg border border-solid border-border bg-surface glass-chrome'
          : 'gap-2',
        className,
      )}
      data-variant={variant}
    >
      {items.map((it) => (
        <AccordionItemPart
          key={it.id}
          value={it.id}
          disabled={it.disabled}
          className={cn(
            'ui-accordion-item group/acc relative min-w-0',
            flush
              ? 'border-0 border-b border-solid border-border-subtle last:border-b-0 data-open:bg-raised'
              : 'rounded-lg border border-solid border-border bg-surface transition-[background-color,box-shadow,border-color] duration-(--dur-base) ease-(--ease-out) glass-chrome hover:border-border-strong data-open:border-border-strong data-open:bg-raised data-open:[box-shadow:var(--elev-2)] motion-reduce:transition-none',
          )}
        >
          <span
            aria-hidden="true"
            className="ui-accordion-edge pointer-events-none absolute inset-y-2 start-0 w-[3px] origin-center scale-y-0 rounded-pill bg-brand transition-transform duration-(--dur-base) ease-(--ease-out) group-data-open/acc:scale-y-100 motion-reduce:transition-none"
          />
          <AccordionHeader className="m-0 font-sans text-[14px] font-semibold leading-snug">
            <AccordionTrigger className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-4 py-3 text-start font-[inherit] text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring-inset)] data-disabled:cursor-not-allowed data-disabled:text-disabled-fg">
              {it.icon && (
                <span
                  aria-hidden="true"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-solid border-border-subtle bg-sunken text-fg-muted transition-colors duration-(--dur-base) group-data-open/acc:border-brand group-data-open/acc:text-brand motion-reduce:transition-none"
                >
                  <Icon name={it.icon} size={16} />
                </span>
              )}
              <span className="min-w-0 flex-1">{it.title}</span>
              {it.meta && (
                <span className="shrink-0 text-[12px] font-normal text-fg-muted tabular-nums">
                  {it.meta}
                </span>
              )}
              <span
                aria-hidden="true"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-fg-muted transition-[transform,background-color] duration-(--dur-base) ease-(--ease-out) group-hover/acc:bg-hover group-data-open/acc:rotate-180 group-data-open/acc:text-fg motion-reduce:transition-none"
              >
                <Icon name="chevron-down" size={16} />
              </span>
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel className="ui-accordion-panel overflow-hidden">
            <div
              className={cn(
                'ui-accordion-body pb-4 font-sans text-[14px] leading-relaxed text-fg-muted',
                it.icon ? 'ps-[3.75rem] pe-4' : 'px-4',
              )}
            >
              {it.content}
            </div>
          </AccordionPanel>
        </AccordionItemPart>
      ))}
    </AccordionRoot>
  );
}
