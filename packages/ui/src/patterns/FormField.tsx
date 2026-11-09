import { cloneElement, type ReactElement, type ReactNode, useId } from 'react';
import { Label } from '../components/input';
import { Text } from '../components/typography/Text';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* FormField — one labelled control with its help and its error, wired for assistive tech.
   Give it a single control as the child (Input, Textarea, NativeSelect, Checkbox, Switch…)
   and it adds `id` (so the Label's htmlFor matches), `aria-describedby` (the description,
   then the error, after anything the control already had), `aria-invalid` (while there is an
   error) and `aria-required`. A control that must not take an `id` from outside can use the
   render form instead:

     <FormField label="Email" description="We never share it." error={err} required>
       <Input type="email" value={v} onChange={…} />
     </FormField>

     <FormField label="Role">{(c) => <MyPicker {...c} />}</FormField>

   The error sits in a polite live region that is always mounted, so a new error is read when
   it appears. It carries an icon and the words, never colour alone. A required field shows a
   "*" (hidden from screen readers, which hear the control's aria-required instead): say so
   once at the top of the form, "* is required". */
export interface FormControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

export interface FormFieldProps {
  label: ReactNode;
  /** Help under the label. */
  description?: ReactNode;
  /** The problem, in words. Empty or absent means valid. */
  error?: ReactNode;
  required?: boolean;
  /** Use this id for the control instead of a generated one. */
  id?: string;
  /** Keep the label for screen readers only (a search box beside a heading). */
  hideLabel?: boolean;
  children: ReactElement | ((control: FormControlProps) => ReactNode);
  className?: string;
}

export function FormField({
  label,
  description,
  error,
  required,
  id,
  hideLabel,
  children,
  className,
}: FormFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const descId = `${fieldId}-desc`;
  const errId = `${fieldId}-err`;
  const hasError = error !== undefined && error !== null && error !== false && error !== '';

  const control = (existing?: string): FormControlProps => ({
    id: fieldId,
    'aria-describedby':
      [existing, description ? descId : undefined, hasError ? errId : undefined]
        .filter(Boolean)
        .join(' ') || undefined,
    ...(hasError ? { 'aria-invalid': true as const } : {}),
    ...(required ? { 'aria-required': true as const } : {}),
  });

  let field: ReactNode;
  if (typeof children === 'function') {
    field = children(control());
  } else {
    const props = children.props as Record<string, unknown>;
    const wired = control(props['aria-describedby'] as string | undefined);
    field = cloneElement(children, {
      ...wired,
      id: (props.id as string | undefined) ?? wired.id,
    } as Record<string, unknown>);
  }

  return (
    <div className={cn('ui-form-field flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={fieldId} className={cn(hideLabel && 'ui-sr-only')}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-danger">
            {' '}
            *
          </span>
        )}
      </Label>
      {description && (
        <Text id={descId} size="small" tone="subtle">
          {description}
        </Text>
      )}
      {field}
      <div aria-live="polite" id={errId}>
        {hasError && (
          <Text size="small" tone="danger" as="span" className="inline-flex items-start gap-1.5">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </Text>
        )}
      </div>
    </div>
  );
}
