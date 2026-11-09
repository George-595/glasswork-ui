import { createElement, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/* PanelHeader — a panel's heading row: a tracking-spaced micro-title, then
   inline actions. Fixed on port: the title is a real heading (default h2,
   set `level` to fit the page outline) instead of a <span>, so the panel
   shows up in a screen reader's heading list. */
export interface PanelHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  level?: 2 | 3 | 4 | 5 | 6;
}

export function PanelHeader({ className, title, level = 2, children, ...props }: PanelHeaderProps) {
  return (
    <div className={cn('ui-panel-header flex flex-wrap items-center gap-2', className)} {...props}>
      {createElement(
        `h${level}`,
        {
          className:
            'ui-panel-title m-0 font-sans text-[11px] leading-[1.3] font-medium tracking-[0.12em] text-fg-subtle uppercase',
        },
        title,
      )}
      {children}
    </div>
  );
}
