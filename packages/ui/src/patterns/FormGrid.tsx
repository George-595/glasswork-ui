import { Grid, type GridProps } from '../components/layout/Grid';
import { cn } from '../lib/cn';

/* FormGrid — fields in a grid: one column, or two from 768px (one on a phone). A field that
   needs the whole row (a textarea) takes `<GridItem span="full">`. */
export interface FormGridProps extends Omit<GridProps, 'cols' | 'minItemWidth'> {
  /** 1 or 2 columns. Default 2. */
  columns?: 1 | 2;
}

export function FormGrid({ columns = 2, gap = 4, className, ...props }: FormGridProps) {
  return (
    <Grid
      {...props}
      cols={columns === 2 ? { base: 1, md: 2 } : 1}
      gap={gap}
      align="start"
      className={cn('ui-form-grid', className)}
    />
  );
}
