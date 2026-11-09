import { cn } from '../../lib/cn';

export type Breakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl';

/** A value, or one per breakpoint (mobile first: `base` applies everywhere, `sm`+ from 640px,
    `md`+ from 768px, `lg`+ from 1024px, `xl`+ from 1280px). */
export type Responsive<T> = T | Partial<Record<Breakpoint, T>>;

/** The spacing scale by name: 1 4px · 2 8px · 3 12px · 4 16px · 5 24px · 6 32px · 7 48px · 8 64px. */
export type Space = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type ClassTable = Record<Breakpoint, Record<string, string>>;

const ORDER: readonly Breakpoint[] = ['base', 'sm', 'md', 'lg', 'xl'];

/** The classes for a responsive prop, looked up in a literal table (see classes.ts). */
export function responsive<T extends string | number>(
  value: Responsive<T> | undefined,
  table: ClassTable,
): string {
  if (value === undefined) return '';
  if (typeof value !== 'object') return table.base[String(value)] ?? '';
  return cn(
    ORDER.map((bp) => {
      const v = (value as Partial<Record<Breakpoint, T>>)[bp];
      return v === undefined ? '' : (table[bp][String(v)] ?? '');
    }),
  );
}

export type Align = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type Justify = 'start' | 'center' | 'end' | 'between';

export const ALIGN: Record<Align, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

export const JUSTIFY: Record<Justify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
};
