import {
  ResizableHandle as ResizableHandlePart,
  ResizablePanel as ResizablePanelPart,
  Resizable as ResizableRoot,
} from '@ui-sdk/react/resizable';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '../lib/cn';

/* Resizable panels — panes a person sizes by dragging the handle between them or with the
   keyboard, on Vercel's UI SDK resizable (@ui-sdk/react/resizable). Each handle is a focusable
   separator with aria-valuenow/min/max and aria-controls; the arrow keys move it (Shift for a
   bigger step), Home/End jump to the limits, and Enter (or a double-click) collapses a
   `collapsible` panel and restores it. `autoSaveId` keeps the layout for the next visit.

   The look: the handle is a hairline that is a 12px-wide target, with a grip pill in the
   middle. Hovering lights the line in the brand colour; dragging stretches the pill and
   lights the whole line. The panes are a single bordered surface (glass in the glass skin),
   so the split reads as one tool. */
export interface ResizableGroupProps extends ComponentPropsWithoutRef<typeof ResizableRoot> {
  /** Draws the outer frame (border, radius, surface). Default true; off for a nested group. */
  framed?: boolean;
  /** A fixed height in px (the panes need a box to share). Default: the parent's height. */
  height?: number;
}

export function ResizableGroup({
  framed = true,
  height,
  className,
  style,
  ...props
}: ResizableGroupProps) {
  return (
    <ResizableRoot
      style={height ? { height, ...style } : style}
      className={cn(
        'ui-resizable flex h-full min-h-0 w-full min-w-0 data-[orientation=vertical]:flex-col',
        framed &&
          'overflow-hidden rounded-lg border border-solid border-border bg-surface [box-shadow:var(--elev-card)] glass-chrome',
        className,
      )}
      {...props}
    />
  );
}

export interface ResizablePaneProps extends ComponentPropsWithoutRef<typeof ResizablePanelPart> {
  /** Pads the content under a PaneHeader (12px), for panes that hold plain content rather than
      a list or tree with its own padding. Default false. */
  padded?: boolean;
}

export function ResizablePane({ className, padded = false, ...props }: ResizablePaneProps) {
  return (
    <ResizablePanelPart
      className={cn(
        'ui-resizable-pane relative min-h-0 min-w-0 overflow-auto',
        padded && '[&>:not(.ui-pane-header)]:m-3',
        className,
      )}
      {...props}
    />
  );
}

export interface ResizableHandleProps extends ComponentPropsWithoutRef<typeof ResizableHandlePart> {
  /** Names the handle: "Resize the file list". */
  'aria-label': string;
}

export function ResizableHandle({ className, ...props }: ResizableHandleProps) {
  return (
    <ResizableHandlePart
      className={cn(
        'ui-resizable-handle group/rh relative z-10 flex shrink-0 touch-none items-center justify-center outline-none',
        'data-[orientation=horizontal]:w-px data-[orientation=horizontal]:cursor-col-resize data-[orientation=vertical]:h-px data-[orientation=vertical]:cursor-row-resize',
        'bg-border transition-colors duration-(--dur-fast) data-dragging:bg-brand data-hovering:bg-brand motion-reduce:transition-none',
        // the reachable target reaches 6px either side of the hairline
        'before:absolute before:content-[""] data-[orientation=horizontal]:before:inset-y-0 data-[orientation=horizontal]:before:-inset-x-1.5 data-[orientation=vertical]:before:inset-x-0 data-[orientation=vertical]:before:-inset-y-1.5 pointer-coarse:data-[orientation=horizontal]:before:-inset-x-6 pointer-coarse:data-[orientation=vertical]:before:-inset-y-6',
        'focus-visible:bg-brand',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'ui-resizable-grip relative rounded-pill border border-solid border-border-strong bg-raised [box-shadow:var(--elev-1)] transition-[height,width,background-color,border-color] duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none',
          'group-data-[orientation=horizontal]/rh:h-8 group-data-[orientation=horizontal]/rh:w-1.5 group-data-[orientation=vertical]/rh:h-1.5 group-data-[orientation=vertical]/rh:w-8',
          'group-data-hovering/rh:border-brand group-data-dragging/rh:border-brand group-data-dragging/rh:bg-brand group-data-[orientation=horizontal]/rh:group-data-dragging/rh:h-14 group-data-[orientation=vertical]/rh:group-data-dragging/rh:w-14',
          'group-focus-visible/rh:[box-shadow:var(--ring)]',
        )}
      />
    </ResizableHandlePart>
  );
}

/** A pane's title row, for the common case of labelled panes. */
export function PaneHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ui-pane-header sticky top-0 z-[1] flex min-h-10 items-center justify-between gap-2 border-0 border-b border-solid border-border-subtle bg-surface px-3 font-sans text-[12px] font-semibold tracking-wide text-fg-muted uppercase glass-chrome">
      <span className="min-w-0 truncate">{title}</span>
      {actions}
    </div>
  );
}
