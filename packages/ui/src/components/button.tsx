import { cva } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef, type MouseEvent } from 'react';
import { cn } from '../lib/cn';
import { playSound, type SoundName } from '../sound';

/* Button — eight levels (ENGINEERING §5), each built from its own colour roles
   and nothing else, so it reads the same in all four themes:

     level       rest                          hover / pressed
     primary     bg-primary  text-on-primary   -hover / -active
     secondary   bg-secondary text-on-secondary -hover / -active
     neutral     bg-neutral  text-on-neutral   -hover / -active, border neutral-border
     outline     clear       text-on-outline   outline-hover / outline-active, border outline-border
     ghost       clear       text-on-ghost     ghost-hover / ghost-active
     link        text-link                     link-hover, underline
     danger      bg-danger-solid text-on-danger -hover / -active
     success     bg-success-solid text-on-success -hover / -active

   States, the same for every level:
   - hover         the level's -hover role;
   - pressed       `:active`, `aria-pressed="true"` and `data-state="on"` take the
                   -active role and the inset elevation (--elev-inset);
   - disabled      `disabled` or `aria-disabled`: bg-disabled, text-disabled-fg,
                   border-disabled-border (no opacity); link keeps only the text role;
   - focus         focus-visible draws --ring over any elevation;
   - loading       aria-busy, a spinner over the label (the label keeps the width),
                   aria-disabled, and clicks are ignored.
   Glass needs no branch: the roles differ per skin, and the sheen effect (transparent
   in enterprise) is added to the filled levels.

   Old names still work as aliases (LEGACY_VARIANTS): `destructive` is `danger`; the
   old elevated-neutral `secondary` look is `neutral` and the old `accent-outline` is
   the new `secondary`. Every call site uses the new names.

   For a link that looks like a button, spread `buttonAttrs()` on an <a>. */
export type ButtonLevel =
  | 'primary'
  | 'secondary'
  | 'neutral'
  | 'outline'
  | 'ghost'
  | 'link'
  | 'danger'
  | 'success';
/** Pre-roles names, accepted for safety. */
export type LegacyButtonVariant = 'destructive' | 'accent-outline';
export type ButtonVariant = ButtonLevel | LegacyButtonVariant;
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl' | 'icon';

export const BUTTON_LEVELS: readonly ButtonLevel[] = [
  'primary',
  'secondary',
  'neutral',
  'outline',
  'ghost',
  'link',
  'danger',
  'success',
];

/** Alias → level. (The old `secondary` was the elevated neutral look: it is now `neutral`, and
    the name `secondary` belongs to the indigo-wash level that `accent-outline` used to be.) */
export const LEGACY_VARIANTS: Record<LegacyButtonVariant, ButtonLevel> = {
  destructive: 'danger',
  'accent-outline': 'secondary',
};

export function resolveButtonLevel(variant: ButtonVariant): ButtonLevel {
  return variant in LEGACY_VARIANTS
    ? LEGACY_VARIANTS[variant as LegacyButtonVariant]
    : (variant as ButtonLevel);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Busy: shows a spinner, keeps the width, and ignores clicks. */
  loading?: boolean;
  /** An interface sound to play when the button is pressed. None by default. */
  sound?: SoundName;
}

/* The elevation lives in --btn-shadow so the pressed inset and the focus ring
   can each replace it without fighting over `box-shadow`. */
const base = [
  'ui-button relative box-border inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center gap-1.5',
  'rounded-sm border border-solid',
  'font-sans font-medium whitespace-nowrap no-underline',
  '[box-shadow:var(--btn-shadow,0_0_transparent)]',
  'transition-[background-color,color,border-color,transform] duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
  'active:translate-y-px motion-reduce:active:translate-y-0',
  // pressed: the inset elevation (the -active fill is set per level below)
  '[&:is(:active,[aria-pressed=true],[data-state=on]):not(:disabled,[aria-disabled=true])]:[--btn-shadow:var(--elev-inset)]',
  'focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
  'disabled:pointer-events-none aria-disabled:pointer-events-none',
  'disabled:border-disabled-border disabled:bg-disabled disabled:text-disabled-fg',
  'aria-disabled:border-disabled-border aria-disabled:bg-disabled aria-disabled:text-disabled-fg',
  'aria-busy:cursor-progress',
  '[&>svg]:pointer-events-none',
];

const FILLED_RING = '[--btn-shadow:var(--sheen)]';
const FLAT = '[--btn-shadow:var(--elev-0)]';

const levels = {
  primary: [
    'border-transparent bg-primary text-on-primary',
    'hover:bg-primary-hover active:bg-primary-active',
    'not-disabled:not-aria-disabled:aria-pressed:bg-primary-active not-disabled:not-aria-disabled:data-[state=on]:bg-primary-active',
    'not-disabled:not-aria-disabled:aria-expanded:bg-primary-hover',
    FILLED_RING,
  ],
  secondary: [
    'border-transparent bg-secondary text-on-secondary',
    'hover:bg-secondary-hover active:bg-secondary-active',
    'not-disabled:not-aria-disabled:aria-pressed:bg-secondary-active not-disabled:not-aria-disabled:data-[state=on]:bg-secondary-active',
    'not-disabled:not-aria-disabled:aria-expanded:bg-secondary-hover',
    FLAT,
  ],
  neutral: [
    'border-neutral-border bg-neutral text-on-neutral',
    'hover:bg-neutral-hover active:bg-neutral-active',
    'not-disabled:not-aria-disabled:aria-pressed:bg-neutral-active not-disabled:not-aria-disabled:data-[state=on]:bg-neutral-active',
    'not-disabled:not-aria-disabled:aria-expanded:bg-neutral-hover',
    FLAT,
  ],
  outline: [
    'border-outline-border bg-transparent text-on-outline',
    'hover:bg-outline-hover active:bg-outline-active',
    'not-disabled:not-aria-disabled:aria-pressed:bg-outline-active not-disabled:not-aria-disabled:data-[state=on]:bg-outline-active',
    'not-disabled:not-aria-disabled:aria-expanded:bg-outline-hover',
    FLAT,
  ],
  ghost: [
    'border-transparent bg-transparent text-on-ghost',
    'hover:bg-ghost-hover active:bg-ghost-active',
    'not-disabled:not-aria-disabled:aria-pressed:bg-ghost-active not-disabled:not-aria-disabled:data-[state=on]:bg-ghost-active',
    'not-disabled:not-aria-disabled:aria-expanded:bg-ghost-hover',
  ],
  link: [
    'border-transparent bg-transparent text-link underline-offset-4 [box-shadow:none]',
    'hover:text-link-hover hover:underline active:text-link-hover',
    'not-disabled:not-aria-disabled:aria-pressed:text-link-hover not-disabled:not-aria-disabled:aria-pressed:underline',
    'disabled:bg-transparent disabled:border-transparent aria-disabled:bg-transparent aria-disabled:border-transparent',
  ],
  danger: [
    'border-transparent bg-danger-solid text-on-danger',
    'hover:bg-danger-solid-hover active:bg-danger-solid-active',
    'not-disabled:not-aria-disabled:aria-pressed:bg-danger-solid-active not-disabled:not-aria-disabled:data-[state=on]:bg-danger-solid-active',
    'not-disabled:not-aria-disabled:aria-expanded:bg-danger-solid-hover',
    FILLED_RING,
  ],
  success: [
    'border-transparent bg-success-solid text-on-success',
    'hover:bg-success-solid-hover active:bg-success-solid-active',
    'not-disabled:not-aria-disabled:aria-pressed:bg-success-solid-active not-disabled:not-aria-disabled:data-[state=on]:bg-success-solid-active',
    'not-disabled:not-aria-disabled:aria-expanded:bg-success-solid-hover',
    FILLED_RING,
  ],
} satisfies Record<ButtonLevel, string[]>;

const cvaButton = cva(base, {
  variants: {
    variant: levels,
    size: {
      // The control heights the whole kit shares (inputs and selects are 36
      // too): sm 32, md 36, lg 40, icon a 36 square. Radius --r-sm, --r-md on lg.
      // On a touch screen (pointer: coarse) sm, md, lg and icon grow to a 48px target (UX
      // principle 6): WCAG 2.5.8 is the floor, a thumb outdoors is the goal. sm is the small
      // button of a dense bar (a card's action, a dialog's footer), and is 48 square at least on
      // a phone too, so an icon-only one is a full target. xl is the one primary action of a
      // flow: 56px, at home full width.
      sm: 'min-h-8 px-2.5 py-1 text-[12.5px] leading-[1.2] pointer-coarse:min-h-12 pointer-coarse:min-w-12',
      md: 'min-h-9 px-3.5 py-1.5 text-[13px] leading-[1.2] pointer-coarse:min-h-12',
      lg: 'min-h-10 rounded-md px-4 py-2 text-[14px] leading-[1.2] pointer-coarse:min-h-12',
      xl: 'min-h-14 rounded-md px-5 py-3 text-[16px] leading-[1.2] font-semibold',
      icon: 'size-9 p-0 text-[13px] leading-[1.2] pointer-coarse:size-12',
    },
  },
  // a link reads inline: no button height, a 24px target with a mouse and 44px on a touch
  // screen (the most a link can grow without breaking up a line of text)
  compoundVariants: [
    {
      variant: 'link',
      class: 'min-h-6 px-0.5 py-0 pointer-coarse:min-h-11 pointer-coarse:min-w-0',
    },
  ],
  defaultVariants: { variant: 'primary', size: 'md' },
});

/** The class string for a level and size (aliases accepted). */
export function buttonVariants({
  variant = 'primary',
  size = 'md',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} = {}) {
  return cvaButton({ variant: resolveButtonLevel(variant), size });
}

/** Button classes and data attributes, for an element that is not a <button>. */
export function buttonAttrs(variant: ButtonVariant = 'primary', size: ButtonSize = 'md') {
  return {
    className: cn(buttonVariants({ variant, size })),
    'data-variant': resolveButtonLevel(variant),
    'data-size': size,
  };
}

function Spinner() {
  return (
    <span aria-hidden="true" className="ui-button-spinner absolute inset-0 grid place-items-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="animate-spin motion-reduce:animate-none"
      >
        <circle cx="12" cy="12" r="9" className="opacity-25" />
        <path d="M21 12a9 9 0 0 0-9-9" />
      </svg>
    </span>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    type = 'button',
    loading = false,
    sound,
    onClick,
    children,
    ...props
  },
  ref,
) {
  const level = resolveButtonLevel(variant);
  const ariaDisabled =
    loading || props['aria-disabled'] === true || props['aria-disabled'] === 'true';
  const guard = (e: MouseEvent<HTMLButtonElement>) => {
    // aria-disabled keeps the button focusable, so it must also ignore the click
    if (ariaDisabled) {
      e.preventDefault();
      return;
    }
    if (sound) playSound(sound);
    onClick?.(e);
  };
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant: level, size }), className)}
      data-variant={level}
      data-size={size}
      aria-busy={loading || undefined}
      aria-disabled={ariaDisabled || undefined}
      onClick={guard}
    >
      {loading ? (
        <>
          <span className="inline-flex items-center justify-center gap-1.5 opacity-0">
            {children}
          </span>
          <Spinner />
        </>
      ) : (
        children
      )}
    </button>
  );
});
