import {
  type ChangeEventHandler,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* Checkbox — shadcn's checkbox look on a native <input type="checkbox"> (the
   native control already has the role, the keys and the form value; Radix's
   button version is not needed). The tick and the mixed-state dash are drawn
   by ::after. Colours are roles only: border-border-input at rest (3:1), the primary
   fill when checked or mixed, border-danger when invalid, the disabled roles when
   disabled. Glass differs through the roles.
   With `label` it renders the label row itself; without, label it yourself. */
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  /** The mixed state; set as a DOM property, as HTML has no attribute for it. */
  indeterminate?: boolean;
}

const box = cn(
  'ui-checkbox relative m-1 inline-grid size-[18px] shrink-0 cursor-pointer appearance-none place-content-center',
  // the box stays 18px; on a touch screen its tap area is a 48px square around it (an
  // invisible ::before: the tick is the ::after), so a thumb outdoors does not miss
  "pointer-coarse:before:absolute pointer-coarse:before:-inset-4 pointer-coarse:before:content-['']",
  'rounded-[4px] border border-solid border-border-input bg-sunken',
  '[box-shadow:var(--check-shadow,0_0_transparent)]',
  // the tick: an L rotated 45deg, scaled in when checked
  "after:-mt-0.5 after:h-[9px] after:w-[5px] after:border-solid after:border-on-primary after:content-['']",
  // craft-ok: a tick grows from its centre
  'after:[border-width:0_2px_2px_0] after:rotate-45 after:scale-0 after:transition-[scale] after:duration-(--dur-fast) after:ease-(--ease-spring) motion-reduce:after:transition-none',
  'checked:after:scale-100 not-disabled:checked:border-primary not-disabled:checked:bg-primary not-disabled:checked:text-on-primary not-disabled:checked:[--check-shadow:var(--sheen)]',
  // the mixed state: a flat dash
  'not-disabled:indeterminate:border-primary not-disabled:indeterminate:bg-primary not-disabled:indeterminate:text-on-primary not-disabled:indeterminate:[--check-shadow:var(--sheen)] indeterminate:after:m-0 indeterminate:after:h-0 indeterminate:after:w-[9px]',
  'indeterminate:after:[border-width:0_0_2px] indeterminate:after:rotate-0 indeterminate:after:scale-100',
  'not-disabled:not-checked:not-indeterminate:hover:border-fg-muted not-disabled:checked:hover:bg-primary-hover not-disabled:indeterminate:hover:bg-primary-hover',
  'aria-invalid:border-danger',
  'focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
  'disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:after:border-disabled-fg',
);

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, indeterminate = false, onChange, ...props },
  ref,
) {
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement);
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const cls = cn(box, className);
  const changed: ChangeEventHandler<HTMLInputElement> = (e) => {
    playSound('tick');
    onChange?.(e);
  };
  if (label === undefined)
    return <input ref={inner} type="checkbox" className={cls} onChange={changed} {...props} />;
  return (
    <label className="ui-check-row inline-flex cursor-pointer items-center gap-1.5 rounded-xs pr-2 text-[13px] leading-normal text-fg-muted transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg has-[:disabled]:cursor-not-allowed has-[:disabled]:hover:bg-transparent motion-reduce:transition-none">
      <input ref={inner} type="checkbox" className={cls} onChange={changed} {...props} />
      {label}
    </label>
  );
});
