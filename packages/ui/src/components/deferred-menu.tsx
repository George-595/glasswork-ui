import { type PointerEvent, type ReactElement, useEffect, useRef } from 'react';
import { cn } from '../lib/cn';
import { type DeferredModule, deferredModule, useDeferredModule } from './deferred';
import type { MenuProps } from './menu';
import { MenuTrigger } from './menu-trigger';

/* DeferredMenu — Menu with Radix fetched on intent. An always-mounted menu (the shell's user menu) costs one
   button in the first load; the Radix menu, popper and focus stack arrive when the browser is idle, or at once on
   hover, focus, a press or a key.

   Before it arrives the stand-in is the same markup as Menu's closed trigger (MenuTrigger inside the same wrapper),
   less Radix's id and aria-controls. A press, Enter, Space, ArrowDown or ArrowUp before then is not lost: the menu opens as
   soon as it arrives, with focus where Radix would have put it. A stand-in that had focus hands it to the real
   trigger. */
/** An open gesture older than this when Radix arrives is ignored. */
const GESTURE_MS = 2000;

type MenuModule = Pick<typeof import('./menu'), 'Menu'>;

/** @internal The factory, so a test can hold the module back. */
export function createDeferredMenu(module: DeferredModule<MenuModule>) {
  return function DeferredMenu(props: MenuProps): ReactElement {
    const { module: loaded, request } = useDeferredModule(module);
    /* The open gesture waiting for Radix. It is dropped when focus leaves, when the fetch fails and after
       GESTURE_MS: a gesture that old is not what the person wants now. */
    const gesture = useRef<{ mode: 'pointer' | 'keyboard' | 'keyboard-last'; at: number }>(
      undefined,
    );
    const say = (mode: 'pointer' | 'keyboard' | 'keyboard-last') => {
      gesture.current = { mode, at: Date.now() };
    };
    const ask = () => {
      request();
      module.load().catch(() => {
        gesture.current = undefined;
      });
    };
    const hadFocus = useRef(false);
    const pointerDown = useRef(false);
    const { defaultOpen } = props;
    useEffect(() => {
      if (defaultOpen) request(); // shown open from the start: nothing to wait for
    }, [defaultOpen, request]);

    if (loaded) {
      const Menu = loaded.Menu;
      const g = gesture.current;
      const fresh = g && Date.now() - g.at <= GESTURE_MS ? g.mode : undefined;
      return <Menu {...props} openOnMount={fresh} focusOnMount={hadFocus.current} />;
    }

    const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
      ask();
      pointerDown.current = e.button === 0 && !e.ctrlKey;
      if (pointerDown.current) say('pointer');
    };
    return (
      <div className={cn('ui-menu-wrap relative inline-flex', props.className)}>
        <MenuTrigger
          label={props.label}
          icon={props.icon}
          iconOnly={props.iconOnly}
          iconSize={props.iconSize}
          aria-haspopup="menu"
          aria-expanded="false"
          data-state="closed"
          type="button"
          onPointerEnter={ask}
          onFocus={() => {
            hadFocus.current = true;
            ask();
          }}
          onBlur={() => {
            hadFocus.current = false;
            gesture.current = undefined;
          }}
          onPointerDown={onPointerDown}
          onKeyDown={(e) => {
            ask();
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault(); // as Radix's trigger does; Enter would otherwise also click
              say('keyboard');
            } else if (e.key === 'ArrowUp') {
              e.preventDefault(); // as Menu does: it opens on the last item
              say('keyboard-last');
            }
          }}
          onClick={() => {
            ask();
            // a press already said so; a bare click comes from assistive tech or a script
            if (!pointerDown.current) say('pointer');
            pointerDown.current = false;
          }}
        />
      </div>
    );
  };
}

export const DeferredMenu = createDeferredMenu(deferredModule(() => import('./menu')));
