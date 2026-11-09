import * as React from 'react';
import { cn } from '../../lib/cn';

/* shadcn's table parts on our tokens. Unlike upstream, Table carries no
   scroll wrapper of its own: DataTable puts it in a focusable, labelled,
   glass scroll region. Header and rows sit on the surface they are placed
   on; the header sits on `sunken`, the hover wash is the `hover` role. */
const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table
      ref={ref}
      className={cn(
        'w-full border-collapse font-sans text-[13px] leading-[1.4] text-fg',
        className,
      )}
      {...props}
    />
  ),
);
Table.displayName = 'Table';

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn(
      'px-3.5 pt-3 pb-2 text-left font-sans text-[14px] font-semibold leading-[1.3] text-fg',
      className,
    )}
    {...props}
  />
));
TableCaption.displayName = 'TableCaption';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn('bg-sunken [&_tr]:border-b [&_tr]:border-border-strong', className)}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-border-subtle transition-colors duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-10 whitespace-nowrap px-3.5 text-left align-middle font-sans text-[11px] font-medium uppercase leading-[1.3] tracking-[0.08em] text-fg-muted',
      className,
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('px-3.5 py-2.5 text-left align-middle', className)} {...props} />
));
TableCell.displayName = 'TableCell';

export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow };
