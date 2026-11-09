import { cva } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/* Badge — the small uppercase pill for kinds and statuses. The text carries the
   meaning; the colour only reinforces it (WCAG 1.4.1).

   `variant` is the tone, a status role: success, warning, danger, info, brand,
   neutral (and the market roles up / down). `appearance` is how it is drawn:
   - soft     the tone's wash behind the tone's text (`x-soft` + `x`), the default;
   - outline  a hairline in the tone, text in the tone, no fill;
   - solid    the filled primary pill (brand only).
   Old names keep working: default = neutral, accent = brand, warn = warning,
   solid = brand + solid. */
export type BadgeTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'brand'
  | 'neutral'
  | 'up'
  | 'down';
export type LegacyBadgeVariant = 'default' | 'accent' | 'warn' | 'solid';
export type BadgeVariant = BadgeTone | LegacyBadgeVariant;
export type BadgeAppearance = 'soft' | 'outline' | 'solid';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  appearance?: BadgeAppearance;
}

const LEGACY: Record<LegacyBadgeVariant, { tone: BadgeTone; appearance?: BadgeAppearance }> = {
  default: { tone: 'neutral' },
  accent: { tone: 'brand' },
  warn: { tone: 'warning' },
  solid: { tone: 'brand', appearance: 'solid' },
};

export function resolveBadge(
  variant: BadgeVariant,
  appearance?: BadgeAppearance,
): { tone: BadgeTone; appearance: BadgeAppearance } {
  const legacy = variant in LEGACY ? LEGACY[variant as LegacyBadgeVariant] : undefined;
  return {
    tone: legacy ? legacy.tone : (variant as BadgeTone),
    appearance: appearance ?? legacy?.appearance ?? 'soft',
  };
}

export const badgeVariants = cva(
  [
    'ui-badge inline-flex shrink-0 items-center rounded-pill border border-solid px-[7px] py-[1.5px]',
    'font-sans text-[10.5px] leading-[1.4] font-medium tracking-[0.06em] uppercase',
  ],
  {
    variants: {
      tone: {
        success: '',
        warning: '',
        danger: '',
        info: '',
        brand: '',
        neutral: '',
        up: '',
        down: '',
      },
      appearance: { soft: '', outline: 'bg-transparent', solid: '' },
    },
    compoundVariants: [
      {
        tone: 'success',
        appearance: 'soft',
        class: 'border-transparent bg-success-soft text-success',
      },
      {
        tone: 'warning',
        appearance: 'soft',
        class: 'border-transparent bg-warning-soft text-warning',
      },
      {
        tone: 'danger',
        appearance: 'soft',
        class: 'border-transparent bg-danger-soft text-danger',
      },
      { tone: 'info', appearance: 'soft', class: 'border-transparent bg-info-soft text-info' },
      { tone: 'brand', appearance: 'soft', class: 'border-transparent bg-brand-soft text-brand' },
      { tone: 'neutral', appearance: 'soft', class: 'border-border bg-sunken text-fg-muted' },
      { tone: 'up', appearance: 'soft', class: 'border-transparent bg-up-soft text-up' },
      { tone: 'down', appearance: 'soft', class: 'border-transparent bg-down-soft text-down' },
      { tone: 'success', appearance: 'outline', class: 'border-success text-success' },
      { tone: 'warning', appearance: 'outline', class: 'border-warning text-warning' },
      { tone: 'danger', appearance: 'outline', class: 'border-danger text-danger' },
      { tone: 'info', appearance: 'outline', class: 'border-info text-info' },
      { tone: 'brand', appearance: 'outline', class: 'border-brand text-brand' },
      { tone: 'neutral', appearance: 'outline', class: 'border-border-strong text-fg-muted' },
      { tone: 'up', appearance: 'outline', class: 'border-up text-up' },
      { tone: 'down', appearance: 'outline', class: 'border-down text-down' },
      // solid is the filled primary pill, whatever the tone asked for
      {
        appearance: 'solid',
        class: 'border-transparent bg-primary text-on-primary [box-shadow:var(--sheen)]',
      },
    ],
    defaultVariants: { tone: 'neutral', appearance: 'soft' },
  },
);

export function Badge({ className, variant = 'neutral', appearance, ...props }: BadgeProps) {
  const r = resolveBadge(variant, appearance);
  return (
    <span
      className={cn(badgeVariants({ tone: r.tone, appearance: r.appearance }), className)}
      data-variant={variant}
      data-tone={r.tone}
      data-appearance={r.appearance}
      {...props}
    />
  );
}
