import { createElement, forwardRef, type HTMLAttributes, type Ref } from 'react';
import { LiquidGlass } from '../glass/LiquidGlass';
import { cn } from '../lib/cn';

/* Card — a surface with a hairline border. In the glass skin it is a translucent role fill
   with the glass rim and elevation, and no backdrop filter of its own: a card scrolls with the
   page, and a backdrop filter on content is re-run for every scrolled frame (ENGINEERING.md
   §5). `lens` turns on real Liquid Glass refraction (src/glass) for the one card that wants it.

   `variant` is how the surface sits on the page:
     surface  the default card                 raised   lifted one step (a pop-out panel)
     sunken   recessed, for wells and code     outline  no fill, a stronger line
   `padding` is the card's own inner space (none by default, because CardHeader and
   CardContent pad themselves; Panel pads for you). */
export type CardVariant = 'surface' | 'raised' | 'sunken' | 'outline';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  /** Fill the height of the box it sits in (a card in a grid cell). */
  fullHeight?: boolean;
  /** The whole card is a tap target (it holds a stretched link or button): a pointer cursor, a
      hover edge and a ring while anything inside has keyboard focus. */
  interactive?: boolean;
  /** Refract the backdrop at the rim in the glass skin (a LiquidGlass SVG filter). Default
      false: a card is content that scrolls and sits in lists, where a moving SVG filter is
      re-run every scrolled frame. Turn it on for one hero card on a page that does not scroll. */
  lens?: boolean;
}

const CARD_VARIANT: Record<CardVariant, string> = {
  surface: 'border-border bg-surface text-fg [box-shadow:var(--elev-card)]',
  raised: 'border-border bg-raised text-fg [box-shadow:var(--elev-2)]',
  sunken: 'border-border-subtle bg-sunken text-fg',
  outline: 'border-border-strong bg-transparent text-fg',
};

const CARD_PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    variant = 'surface',
    padding = 'none',
    fullHeight,
    interactive,
    lens = false,
    className,
    ...props
  },
  ref,
) {
  const classes = cn(
    'ui-card rounded-lg border border-solid',
    CARD_VARIANT[variant],
    CARD_PADDING[padding],
    fullHeight && 'h-full',
    interactive &&
      'relative cursor-pointer transition-[border-color] duration-(--dur-fast) hover:border-fg-muted focus-within:[box-shadow:var(--ring)] motion-reduce:transition-none',
    className,
  );
  // only the two lifted surfaces are glass; a well and an outline stay flat in every skin
  if (variant === 'sunken' || variant === 'outline') {
    return <div ref={ref} data-variant={variant} className={classes} {...props} />;
  }
  return (
    <LiquidGlass
      ref={ref as Ref<HTMLElement>}
      data-variant={variant}
      fill={variant === 'raised' ? 'raised' : 'surface'}
      lens={lens}
      className={classes}
      {...props}
    />
  );
});

export interface PanelProps extends CardProps {
  /** Space between the panel's children, from the spacing scale. Default 4 (16px). */
  gap?: 1 | 2 | 3 | 4 | 5 | 6;
}

const PANEL_GAP = {
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-6',
  6: 'gap-8',
} as const;

/** A Card that pads and spaces its own content: the box most dashboard blocks are. */
export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { padding = 'md', gap = 4, className, ...props },
  ref,
) {
  return (
    <Card
      ref={ref}
      padding={padding}
      className={cn('ui-panel flex min-w-0 flex-col', PANEL_GAP[gap], className)}
      {...props}
    />
  );
});

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ui-card-header flex flex-col gap-1.5 p-4', className)} {...props} />;
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Heading level, so the card fits the page outline. Default h3. */
  as?: 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export function CardTitle({ as = 'h3', className, ...props }: CardTitleProps) {
  return createElement(as, {
    className: cn(
      'ui-card-title m-0 font-sans text-[14px] leading-[1.25] font-semibold text-fg',
      className,
    ),
    ...props,
  });
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('ui-card-description m-0 text-[13px] leading-normal text-fg-subtle', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ui-card-content px-4 pb-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('ui-card-footer flex items-center gap-2 px-4 pb-4', className)} {...props} />
  );
}
