import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from '@ui-sdk/react/drawer';
import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { buttonAttrs } from './button';

/* SnapDrawer — a bottom sheet that rests at set heights (a peek, half, full), on Vercel's UI
   SDK drawer (@ui-sdk/react/drawer). It follows a finger, mouse or pen with a spring fitted to
   iOS, a fast fling skips a resting point, and a pull past the bottom closes it. The handle is
   a real button: pressing it steps to the next height, Up/Down/Home/End move between heights
   (a phone's screen reader adjusts it like a slider). Esc and Close dismiss it; focus is
   trapped while it is modal and returns to the trigger.

   `peek` (a snap point, default 0.28) is where the page behind stays usable and undimmed, like
   a map with a sheet of results over it (`modalAbove`); above it the sheet is modal. While it
   rises, the sheet's corners square off and the backdrop dims, both driven by the drawer's own
   progress (`--drawer-progress`), so the motion and the chrome stay in step. Under reduced
   motion it fades instead of sliding. */
export interface SnapDrawerProps {
  /** The trigger's text. */
  trigger: ReactNode;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  /** Resting heights, fractions of the screen. Default [0.28, 0.6, 1]. */
  snapPoints?: readonly number[];
  /** Where it opens. Default the middle point. */
  defaultSnapPoint?: number;
  /** Below and at this height the page stays usable. Default the first point. */
  peek?: number;
  /** A row of actions under the content. */
  footer?: ReactNode;
  className?: string;
}

export function SnapDrawer({
  trigger,
  title,
  description,
  children,
  snapPoints = [0.28, 0.6, 1],
  defaultSnapPoint,
  peek,
  footer,
  className,
}: SnapDrawerProps) {
  const points = [...snapPoints];
  const start = defaultSnapPoint ?? points[Math.floor(points.length / 2)] ?? 1;
  return (
    <Drawer
      snapPoints={points}
      defaultSnapPoint={start}
      modalAbove={peek ?? points[0]}
      expandOnScroll
    >
      <DrawerTrigger {...buttonAttrs('outline', 'md')}>
        <Icon name="layers" size={15} />
        {trigger}
      </DrawerTrigger>
      <DrawerBackdrop className="ui-drawer-backdrop fixed inset-0 z-40 bg-scrim" />
      <DrawerContent
        className={cn(
          'ui-snap-drawer fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[calc(100dvh-max(1.5rem,env(safe-area-inset-top)+0.5rem))] w-full max-w-2xl flex-col border border-b-0 border-solid border-border bg-raised text-fg [box-shadow:var(--elev-3)] glass-chrome outline-none',
          className,
        )}
      >
        <DrawerHandle
          aria-label="Resize the sheet"
          className="group/dh mx-auto mt-2 mb-1 flex min-h-6 w-24 cursor-grab items-center justify-center rounded-pill border-0 bg-transparent outline-none pointer-coarse:min-h-12 focus-visible:[box-shadow:var(--ring)] active:cursor-grabbing"
        >
          <span
            aria-hidden="true"
            className="block h-1.5 w-11 rounded-pill bg-border-strong transition-[width,background-color] duration-(--dur-base) ease-(--ease-out) group-hover/dh:w-14 group-hover/dh:bg-fg-muted group-data-expanded/dh:w-8"
          />
        </DrawerHandle>
        <div className="flex items-start gap-3 px-5 pt-1 pb-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DrawerTitle className="m-0 font-sans text-[17px] font-semibold text-fg">
              {title}
            </DrawerTitle>
            <DrawerDescription className="m-0 font-sans text-[13px] text-fg-muted">
              {description}
            </DrawerDescription>
          </div>
          <DrawerClose {...buttonAttrs('ghost', 'icon')} aria-label="Close">
            <Icon name="x" size={16} />
          </DrawerClose>
        </div>
        <div
          className="ui-snap-drawer-body min-h-0 flex-1 overflow-y-auto px-5 pb-6"
          {...{ tabIndex: 0 }}
        >
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-0 border-t border-solid border-border-subtle px-5 py-3">
            {footer}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
