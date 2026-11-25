import type { HTMLAttributes, ReactNode } from 'react';
import type { IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './button';
import { Menu, type MenuItem } from './menu';

/* ButtonGroup — buttons that belong together joined into one bar (Bold, Italic, Underline;
   Day, Week, Month as actions). It is a `role="group"` named by `label`, so a screen reader
   hears the set; each button keeps its own name, focus and target. The inner corners are
   squared and the touching borders shared, in both skins.

   SplitButton — the main action, with a chevron beside it that opens the related ones
   ("Save", and Save as draft, Save and close). The chevron is a real Menu (the WAI-ARIA menu
   button), so its list has the menu's keys; the two halves are one group. */
export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Names the group for assistive tech ("Text style"). */
  label: string;
  /** Stack the buttons top to bottom. */
  vertical?: boolean;
  children: ReactNode;
}

const joined =
  '[&>*:not(:first-child)]:-ms-px [&>*:not(:first-child)]:rounded-s-none [&>*:not(:last-child)]:rounded-e-none ' +
  '[&>*:focus-visible]:z-10 [&>*:hover]:z-[1] [&>.ui-menu-wrap:not(:first-child)>button]:rounded-s-none [&>.ui-menu-wrap:not(:last-child)>button]:rounded-e-none';
const joinedVertical =
  'flex-col [&>*:not(:first-child)]:-mt-px [&>*:not(:first-child)]:rounded-t-none [&>*:not(:last-child)]:rounded-b-none [&>*:focus-visible]:z-10';

export function ButtonGroup({ label, vertical, className, children, ...props }: ButtonGroupProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a row of buttons is a named group, not a form fieldset
    <div
      {...props}
      role="group"
      aria-label={label}
      data-orientation={vertical ? 'vertical' : 'horizontal'}
      className={cn(
        'ui-button-group inline-flex isolate',
        vertical ? joinedVertical : joined,
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface SplitButtonProps extends Omit<ButtonProps, 'children'> {
  /** The main action's text. */
  label: string;
  icon?: IconName;
  /** The other actions, in the chevron's menu. */
  items: readonly MenuItem[];
  /** The chevron's accessible name. Default "More options". */
  moreLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function SplitButton({
  label,
  items,
  moreLabel = 'More options',
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: SplitButtonProps) {
  return (
    <ButtonGroup label={label} className={cn('ui-split-button', className)}>
      <Button {...props} variant={variant} size={size}>
        {label}
      </Button>
      <Menu
        label={moreLabel}
        icon="chevron-down"
        iconOnly
        iconSize={14}
        items={items}
        align="end"
        variant={variant}
        triggerClassName="size-auto min-h-9 px-2 pointer-coarse:min-h-12 pointer-coarse:size-auto pointer-coarse:px-3 border-s-current/25"
      />
    </ButtonGroup>
  );
}
