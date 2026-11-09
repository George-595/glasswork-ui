import { type ReactNode, useCallback, useRef } from 'react';
import { useLiquidGlass } from '../glass/LiquidGlass';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { Button } from './button';
import { PopoverContent, Popover as PopoverRoot, PopoverTrigger } from './ui/popover';
import { useIsClient } from './ui/use-is-client';

/* Popover — a button that opens a small non-modal panel of controls (a
   filter's checkboxes, a column picker). shadcn's Popover on Radix.

   Radix gives the dialog role, focus into the panel on open, Esc back to
   the trigger, a press outside to close and aria-expanded/aria-controls on
   the trigger. The panel is not modal: the page stays reachable, Tab moves
   on through it and out, and focus leaving it closes it. `label` names the
   panel for assistive tech, so give it something specific ("Status filter").

   In the glass skin the panel is a LiquidGlass surface on the --raised
   fill, like Menu. `defaultOpen` renders it open in place (showcase, tests):
   Radix's portal only mounts on the client. */
export interface PopoverProps {
  /** The trigger's visible content. */
  trigger?: ReactNode;
  /** Your own button, used as the trigger instead of the default outline button (the
      notification bell). It must be a single focusable element that forwards its ref and props. */
  customTrigger?: ReactNode;
  /** The panel's accessible name. */
  label: string;
  icon?: IconName;
  /** Paints the trigger as in use (a filter with choices). It adds no meaning on its own: say it in `trigger` too. */
  active?: boolean;
  align?: 'start' | 'center' | 'end';
  children: ReactNode;
  /** A row under the content, set apart by a rule: "Clear", "Reset". */
  footer?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  contentClassName?: string;
}

export function Popover({
  trigger,
  customTrigger,
  label,
  icon,
  active = false,
  align = 'start',
  children,
  footer,
  defaultOpen,
  open,
  onOpenChange,
  className,
  contentClassName,
}: PopoverProps) {
  const client = useIsClient();
  const content = useRef<HTMLDivElement | null>(null);
  const glass = useLiquidGlass<HTMLDivElement>({ fill: 'raised', band: 10, refraction: 24 });
  const setGlassRef = glass.ref;
  const contentRef = useCallback(
    (node: HTMLDivElement | null) => {
      content.current = node;
      setGlassRef(node);
    },
    [setGlassRef],
  );

  return (
    <PopoverRoot defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {customTrigger ?? (
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'ui-popover-trigger',
              active && 'border-brand bg-selected text-fg',
              className,
            )}
            data-active={active || undefined}
          >
            {icon && <Icon name={icon} size={14} />}
            {trigger}
            <Icon name="chevron-down" size={13} />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        portal={client}
        align={align}
        aria-label={label}
        className={cn('ui-popover', glass.props.className, contentClassName)}
        data-lg={glass.props['data-lg']}
        style={glass.props.style}
      >
        {glass.layers}
        {children}
        {footer && (
          <div className="ui-popover-footer mt-2 flex items-center justify-between gap-2 border-0 border-t border-solid border-border-subtle pt-2">
            {footer}
          </div>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}
