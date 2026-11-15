import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { Button } from './button';

/* MenuTrigger — the button of a Menu, with no Radix import. Menu renders it inside DropdownMenuTrigger asChild
   (Radix adds the ARIA state); DeferredMenu renders it alone until Radix has arrived, so the two are the same
   markup by construction. */
export interface MenuTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The trigger's text; the accessible name when `iconOnly`. */
  label: string;
  icon?: IconName;
  iconOnly?: boolean;
  iconSize?: number;
}

export const MenuTrigger = forwardRef<HTMLButtonElement, MenuTriggerProps>(function MenuTrigger(
  { label, icon, iconOnly = false, iconSize = 15, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="md"
      className={
        iconOnly && icon
          ? 'size-6 min-h-6 p-0 pointer-coarse:size-12 pointer-coarse:min-h-12'
          : undefined
      }
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
