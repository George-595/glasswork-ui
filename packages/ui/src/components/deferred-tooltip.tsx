import {
  cloneElement,
  type ReactElement,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { type DeferredModule, deferredModule, useDeferredModule } from './deferred';
import type { TooltipProps } from './tooltip';

/* DeferredTooltip — Tooltip with Radix fetched on intent or idle: a rail of always-mounted links costs the links,
   not the tooltip stack. Before it arrives the child sits in the same wrapper span as Tooltip's, and a hover or a
   focus asks for the module. Radix wraps the child, so React remounts its element on arrival; a child that had
   focus is focused again. The tooltip is a hint only (see Tooltip): the child's own name never depends on it. */
type TooltipModule = Pick<typeof import('./tooltip'), 'Tooltip'>;

/** @internal The factory, so a test can hold the module back. */
export function createDeferredTooltip(module: DeferredModule<TooltipModule>) {
  return function DeferredTooltip(props: TooltipProps): ReactElement {
    const { children, defaultOpen } = props;
    const { module: loaded, request } = useDeferredModule(module);
    const had = useRef(false);
    const target = useRef<HTMLElement | null>(null);
    const childRef = (children.props as { ref?: Ref<HTMLElement> }).ref;
    const setTarget = useCallback(
      (node: HTMLElement | null) => {
        target.current = node;
        if (typeof childRef === 'function') childRef(node);
        else if (childRef) (childRef as { current: HTMLElement | null }).current = node;
      },
      [childRef],
    );
    /* A pointer is down on the stand-in's child: the swap waits until it is up and its click has been dispatched,
       or the click would land on an element that is gone. */
    const [down, setDown] = useState(false);
    useEffect(() => {
      if (!down) return;
      let t: ReturnType<typeof setTimeout> | undefined;
      const up = () => {
        t = setTimeout(() => setDown(false), 0); // after the click that follows pointerup
      };
      const cancel = () => setDown(false);
      document.addEventListener('pointerup', up, { once: true });
      document.addEventListener('pointercancel', cancel, { once: true });
      return () => {
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', cancel);
        clearTimeout(t);
      };
    }, [down]);
    const ready = loaded !== undefined && !down;
    useLayoutEffect(() => {
      if (ready && had.current) target.current?.focus();
    }, [ready]);
    // a tip shown from the start (the showcase, tests) has nothing to wait for
    useEffect(() => {
      if (defaultOpen) request();
    }, [defaultOpen, request]);

    const child = cloneElement(
      children,
      ready
        ? ({ ref: setTarget } as object)
        : ({ ref: setTarget, 'data-state': 'closed' } as object),
    );
    if (loaded && ready) {
      const Tooltip = loaded.Tooltip;
      return <Tooltip {...props}>{child}</Tooltip>;
    }
    return (
      <span
        className="ui-tooltip-wrap relative inline-flex"
        onPointerEnter={request}
        onPointerDownCapture={() => setDown(true)}
        onFocusCapture={() => {
          had.current = true;
          request();
        }}
        onBlurCapture={() => {
          had.current = false;
        }}
      >
        {child}
      </span>
    );
  };
}

export const DeferredTooltip = createDeferredTooltip(deferredModule(() => import('./tooltip')));
