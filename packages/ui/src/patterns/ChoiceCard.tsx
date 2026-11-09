import type { HTMLAttributes, ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* ChoiceCard — one option of a radio group drawn as a card with a picture ("Enterprise" /
   "Glass", a backdrop scene). It is a real <input type="radio"> stretched invisibly over the
   whole card, so the card is one big target, the arrow keys move between the cards of a group
   (same `name`) and a screen reader hears "Glass, radio button, 2 of 2". The picture is
   decorative (aria-hidden); the label and description are the text. The chosen card has the
   selected fill, the brand border and a check mark: never colour alone. Wrap a group in a
   <fieldset> with a <legend> (or a Grid of cards inside one).

   SkinPreview and BackdropSwatch are ready-made pictures for the two usual groups. */
export interface ChoiceCardProps {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  label: ReactNode;
  description?: ReactNode;
  /** The picture. Decorative. */
  preview?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  label,
  description,
  preview,
  disabled,
  className,
}: ChoiceCardProps) {
  return (
    <label
      data-checked={checked || undefined}
      className={cn(
        'ui-choice-card relative grid content-start gap-2 rounded-md border border-solid p-2 text-fg',
        'transition-colors duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
        'has-focus-visible:[box-shadow:var(--ring)]',
        checked
          ? 'border-brand bg-selected'
          : 'border-border-strong bg-surface not-has-disabled:hover:bg-hover',
        disabled ? 'cursor-not-allowed text-disabled-fg' : 'cursor-pointer',
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="absolute inset-0 m-0 h-full w-full cursor-[inherit] opacity-0"
      />
      {preview && (
        <span
          aria-hidden="true"
          className="block overflow-hidden rounded-sm border border-solid border-border"
        >
          {preview}
        </span>
      )}
      <span className="grid gap-1 px-1 pb-1">
        <span className="flex items-center justify-between gap-2 font-semibold">
          {label}
          {checked && <Icon name="check" size={14} className="text-brand" />}
        </span>
        {description && <span className="text-fg-muted [font:var(--t-small)]">{description}</span>}
      </span>
    </label>
  );
}

/** A tiny app drawn in a skin's manner (flat and hairlined, or translucent over a wash). */
export function SkinPreview({
  skin,
  className,
  ...props
}: { skin: 'enterprise' | 'glass' } & HTMLAttributes<HTMLSpanElement>) {
  const glass = skin === 'glass';
  const bar = 'block h-1.5 rounded-pill bg-border-strong';
  const panel = glass
    ? 'rounded-xs border border-solid border-border bg-raised'
    : 'rounded-xs border border-solid border-border bg-surface';
  return (
    <span
      {...props}
      data-skin-preview={skin}
      className={cn(
        'ui-skin-preview grid aspect-[16/10] grid-cols-[22%_minmax(0,1fr)] gap-2 p-2',
        glass ? 'bg-linear-to-br from-backdrop-1 via-canvas to-backdrop-2' : 'bg-canvas',
        className,
      )}
    >
      <span className={cn('grid content-start gap-1 p-1', panel)}>
        <span className={bar} />
        <span className={bar} />
        <span className={bar} />
      </span>
      <span className="grid content-start gap-1">
        <span className="block h-2 w-[45%] rounded-pill bg-fg-muted" />
        <span className="grid grid-cols-2 gap-1">
          <span className={cn('block h-6', panel)} />
          <span className={cn('block h-6', panel)} />
        </span>
        <span className={cn('grid gap-1 p-1', panel)}>
          <span className="block h-2 rounded-xs bg-border-strong" />
          <span className="block h-2 rounded-xs bg-border-strong" />
        </span>
      </span>
    </span>
  );
}

const SWATCH: Record<string, string> = {
  tide: 'bg-linear-to-br from-backdrop-1 via-canvas to-backdrop-2',
  hive: 'bg-linear-to-r from-backdrop-3 via-backdrop-1 to-backdrop-2',
  mesh: 'bg-radial from-backdrop-1 via-backdrop-2 to-canvas',
  'liquid-metal': 'bg-linear-to-br from-fg-subtle via-canvas to-backdrop-1',
  'aurora-noise': 'bg-linear-to-tr from-backdrop-2 via-canvas to-backdrop-3',
  'glass-caustics': 'bg-radial from-canvas via-backdrop-1 to-canvas',
};

/** A still of one glass backdrop scene, from the backdrop roles. Unknown names get the page. */
export function BackdropSwatch({
  backdrop,
  className,
  ...props
}: { backdrop: string } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      data-backdrop={backdrop}
      className={cn(
        'ui-backdrop-swatch block aspect-[16/7] bg-canvas',
        SWATCH[backdrop],
        className,
      )}
    />
  );
}
