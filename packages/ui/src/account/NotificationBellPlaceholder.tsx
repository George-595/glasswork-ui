import { Button } from '../components/button';
import { Icon } from '../icons/Icon';

/* NotificationBellPlaceholder — the bell's own button, drawn the same size and place while the real bell
   (its popover and list) is still loading, so nothing shifts when it arrives. Disabled: it does nothing yet. */
export function NotificationBellPlaceholder() {
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled
      aria-label="Notifications"
      className="ui-bell relative min-h-8 min-w-8"
    >
      <Icon name="bell" size={18} />
    </Button>
  );
}
