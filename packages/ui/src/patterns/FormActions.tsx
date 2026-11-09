import { Cluster, type ClusterProps } from '../components/layout/Cluster';
import { cn } from '../lib/cn';

/* FormActions — the buttons that end a form, end-aligned. Order them least to most
   important: Cancel (neutral or ghost), then the one primary action, last. They wrap on a
   narrow screen. `divided` draws a hairline above, to set the row apart from long forms. */
export interface FormActionsProps extends Omit<ClusterProps, 'justify'> {
  divided?: boolean;
}

export function FormActions({ divided, className, gap = 2, ...props }: FormActionsProps) {
  return (
    <Cluster
      {...props}
      gap={gap}
      justify="end"
      className={cn(
        'ui-form-actions',
        divided && 'border-0 border-t border-solid border-border-subtle pt-4',
        className,
      )}
    />
  );
}
