import { createElement, type HTMLAttributes, type Ref } from 'react';
import { cn } from '../../lib/cn';
import { TEXT_TONE, type TextTone } from './tones';

/* Text — body copy in the kit's type scale, coloured by meaning (`tone`), not by value.
   Eyebrow, Num and Code are the same idea for the small uppercase label above a title, a
   figure, and inline code. */
export type TextSize = 'display' | 'body' | 'small' | 'label' | 'mono' | 'title';
export type TextTag = 'p' | 'span' | 'div' | 'strong' | 'em' | 'small' | 'li' | 'dd' | 'dt';

export interface TextProps extends HTMLAttributes<HTMLElement> {
  size?: TextSize;
  tone?: TextTone;
  as?: TextTag;
  /** One line, ending in an ellipsis. */
  truncate?: boolean;
  align?: 'start' | 'center' | 'end';
  /** Heavier than body weight (a brand name, a figure's label). */
  weight?: 'medium' | 'semibold';
  /** Keep the line breaks and runs of spaces in the text (a model's reply, a log line). */
  preserveLines?: boolean;
  /** The element (React 19 passes `ref` as a prop): a status line that takes focus after the
      thing it counts was removed. */
  ref?: Ref<HTMLElement>;
}

export const TEXT_SIZE: Record<TextSize, string> = {
  /** A big figure that is not a heading (a count, a score). */
  display: '[font:var(--t-h1)] tracking-[-0.015em] tabular-nums',
  body: '[font:var(--t-body)]',
  small: '[font:var(--t-small)]',
  label: '[font:var(--t-label)] tracking-[0.14em] uppercase',
  mono: '[font:var(--t-mono)] tabular-nums',
  title: '[font:var(--t-h2)]',
};

const TEXT_WEIGHT = { medium: 'font-medium', semibold: 'font-semibold' } as const;

const TEXT_ALIGN = { start: 'text-start', center: 'text-center', end: 'text-end' } as const;

export function Text({
  size = 'body',
  tone = 'default',
  as = 'p',
  truncate,
  align,
  weight,
  preserveLines,
  className,
  ...props
}: TextProps) {
  return createElement(as, {
    ...props,
    className: cn(
      'ui-text m-0',
      TEXT_SIZE[size],
      TEXT_TONE[tone],
      truncate && 'truncate',
      align && TEXT_ALIGN[align],
      weight && TEXT_WEIGHT[weight],
      preserveLines && 'whitespace-pre-wrap',
      className,
    ),
  });
}

export interface EyebrowProps extends Omit<TextProps, 'size'> {}

/** The small uppercase label above a title or a figure ("Revenue", "Last 30 days"). */
export function Eyebrow({ tone = 'muted', as = 'p', className, ...props }: EyebrowProps) {
  return (
    <Text {...props} as={as} size="label" tone={tone} className={cn('ui-eyebrow', className)} />
  );
}

export interface NumProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TextTone;
  /** Set in the monospace family, as figures in tables and tiles are. */
  mono?: boolean;
}

/** A figure with tabular numerals, so columns of them line up and changing values don't jitter. */
export function Num({ tone = 'inherit', mono, className, ...props }: NumProps) {
  return (
    <span
      {...props}
      className={cn('ui-num tabular-nums', mono && 'font-mono', TEXT_TONE[tone], className)}
    />
  );
}

export interface CodeProps extends HTMLAttributes<HTMLElement> {
  /** A block (`<pre><code>`) instead of an inline chip. */
  block?: boolean;
}

/** Inline code, or a block of it. Focusable when it can scroll sideways. */
export function Code({ block, className, children, ...props }: CodeProps) {
  /* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable by keyboard */
  if (block) {
    return (
      <pre
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard
        tabIndex={0}
        className={cn(
          'ui-code-block m-0 max-w-full overflow-x-auto rounded-md border border-solid border-border-subtle bg-sunken p-3 text-fg [font:var(--t-mono)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
          className,
        )}
        {...(props as HTMLAttributes<HTMLPreElement>)}
      >
        <code>{children}</code>
      </pre>
    );
  }
  /* oxlint-enable jsx-a11y/no-noninteractive-tabindex */
  return (
    <code
      {...props}
      className={cn(
        'ui-code rounded-xs border border-solid border-border-subtle bg-sunken px-1 py-px font-mono text-[0.9em] text-fg [overflow-wrap:anywhere]',
        className,
      )}
    >
      {children}
    </code>
  );
}
