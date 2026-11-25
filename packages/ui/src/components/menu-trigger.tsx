import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { Button } from './button';

/* MenuTrigger — the button of a Menu, with no UI SDK import. Menu renders it as DropdownMenuTrigger's element
   (the SDK adds the ARIA state); DeferredMenu renders it alone until the SDK has arrived, so the two are the same
   markup by construction. */
export interface MenuTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The trigger's text; the accessible name when `iconOnly`. */
  label: string;
  icon?: IconName;
  iconOnly?: boolean;
  iconSize?: number;
}

export const MenuTrigger = forwardRef<HTMLButtonElement, MenuTriggerProps>(function MenuTrigger(
  { label, icon, iconOnly = false, iconSize = 15, className, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="md"
      className={cn(
        iconOnly && icon && 'size-6 min-h-6 p-0 pointer-coarse:size-12 pointer-coarse:min-h-12',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={iconSize} />}
      {iconOnly && icon ? (
        <span className="ui-sr-only">{label}</span>
      ) : (
        <>
          {label}
          <Icon name="chevron-down" size={14} />
        </>
      )}
    </Button>
  );
});
