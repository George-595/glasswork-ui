import {
  forwardRef,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn';

/* Input — shadcn's input on our tokens: a sunken field, a >= 3:1 control
   border (WCAG 1.4.11), ring focus, 36px tall (the md control height), 48px tall with 16px
   text on a touch screen (a thumb target, and iOS does not zoom a 16px field). In the glass skin it is a frosted glass
   well (backdrop blur, translucent sunken fill, specular rim). It needs a
   visible label: pair it with <Label htmlFor> (useId for the id). */

/** The field look shared by Input, Textarea and NativeSelect. The shadow
    lives in --field-shadow so the focus ring always wins over the rim. */
export const fieldClasses = cn(
  'box-border min-h-9 pointer-coarse:min-h-12 rounded-sm border border-solid border-border-input bg-sunken text-fg',
  'font-sans text-[13px] leading-[1.3] pointer-coarse:text-[16px]',
  '[box-shadow:var(--field-shadow,0_0_transparent)] glass:[--field-shadow:var(--elev-0)]',
  'transition-[border-color] duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
  // hover darkens the boundary toward the ink; focus joins it to the ring
  'not-disabled:hover:border-fg-muted focus-visible:border-primary',
  'focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
  'disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:text-disabled-fg aria-invalid:border-danger aria-invalid:outline-1 aria-invalid:-outline-offset-1 aria-invalid:outline-danger',
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type = 'text', ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'ui-input',
          fieldClasses,
          'px-2.5 py-[7px] placeholder:text-fg-subtle placeholder:opacity-100',
          className,
        )}
        {...props}
      />
    );
  },
);

/** A multi-line Input: the same field look, resizable vertically. */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'ui-input ui-textarea',
        fieldClasses,
        'min-h-16 resize-y px-2.5 py-[7px] placeholder:text-fg-subtle placeholder:opacity-100',
        className,
      )}
      {...props}
    />
  );
});

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** id of the control this labels. Required: a label must name a control. */
  htmlFor: string;
}

export function Label({ className, htmlFor, children, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        'ui-label font-sans text-[12px] leading-[1.3] font-medium text-fg-muted',
        className,
      )}
      htmlFor={htmlFor}
      {...props}
    >
      {children}
    </label>
  );
}
