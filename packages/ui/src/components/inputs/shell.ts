import { cn } from '../../lib/cn';

/* A field-shaped box around several controls (chips and a text box, a number and its steppers):
   the Input material, one focus ring around the whole (focus-within). */
export const shell = cn(
  'ui-field-shell relative flex min-h-9 pointer-coarse:min-h-12 w-full flex-wrap items-center gap-1 p-1 ps-1.5',
  'rounded-sm border border-solid border-border-input bg-sunken text-fg',
  '[box-shadow:var(--field-shadow,0_0_transparent)] glass:[--field-shadow:var(--elev-0)]',
  'transition-[border-color] duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
  'hover:border-fg-muted focus-within:border-primary focus-within:[box-shadow:var(--ring)]',
  'has-aria-invalid:border-danger has-aria-invalid:outline-1 has-aria-invalid:-outline-offset-1 has-aria-invalid:outline-danger',
  'has-[input:disabled]:cursor-not-allowed has-[input:disabled]:border-disabled-border has-[input:disabled]:bg-disabled has-[input:disabled]:text-disabled-fg',
);
