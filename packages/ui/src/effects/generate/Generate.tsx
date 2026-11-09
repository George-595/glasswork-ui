import { type HTMLAttributes, useRef } from 'react';
import { cn } from '../../lib/cn';
import { type UseGenerateOptions, useGenerate } from './useGenerate';

/* Generate — a box whose content is drawn in by generate() when it mounts: a
   drawing measured from the content itself, then the real content developing in (reveal.ts).
   Use it for UI that is a result (a panel whose data just arrived, an AI reply's card),
   not for UI that appears often. `play` false renders the box as it is (content that was
   already there, e.g. served from a cache). */
export interface GenerateProps
  extends HTMLAttributes<HTMLDivElement>,
    Pick<
      UseGenerateOptions,
      'mode' | 'duration' | 'delay' | 'steps' | 'done' | 'traceSvg' | 'each' | 'inView' | 'render'
    > {
  /** Play on mount. Default true. */
  play?: boolean;
  /** `narrow` centres the box at 28rem, leaving room beside it for `skeleton-texts`. Default full. */
  width?: 'full' | 'narrow';
}

export function Generate({
  play = true,
  mode,
  duration,
  delay,
  steps,
  done,
  traceSvg,
  each,
  inView,
  render,
  width = 'full',
  className,
  ...props
}: GenerateProps) {
  const ref = useRef<HTMLDivElement>(null);
  useGenerate(ref, true, {
    onMount: play,
    mode,
    duration,
    delay,
    steps,
    done,
    traceSvg,
    each,
    inView,
    render,
  });
  return (
    <div
      ref={ref}
      className={cn(
        'ui-generate min-w-0',
        width === 'narrow' && 'mx-auto w-full max-w-md',
        className,
      )}
      {...props}
    />
  );
}
