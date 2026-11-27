import { type FieldsetHTMLAttributes, type KeyboardEvent, useState } from 'react';
import { Button } from '../components/button';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* DirectionPad — up, down, left, right and OK, for a TV remote or anything stepped through a
   grid. A group of five real buttons in a cross, each named ("Up", "OK").

   While focus is on a button of the pad the arrow keys press the matching button, from wherever
   focus is; Enter and Space press the focused button itself, as on any button (Tab to "Up", Enter,
   get Up). The pressed look follows the key down and clears on key up or when focus leaves, with
   no timer. A held key is one press: key repeat is ignored (a remote's command is not a stream). A press plays the kit's tick. Keys are 56px (md) or 72px (lg). */
export type PadKey = 'up' | 'down' | 'left' | 'right' | 'select';

export interface DirectionPadProps
  extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, 'children'> {
  /** Names the pad: 'Remote'. */
  label: string;
  onPress: (key: PadKey) => void;
  disabled?: boolean;
  size?: 'md' | 'lg';
  /** Replace the default words ('Up', 'Down', 'Left', 'Right', 'OK'). */
  labels?: Partial<Record<PadKey, string>>;
}

const DEFAULT_LABELS: Record<PadKey, string> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  select: 'OK',
};
const ICON: Record<Exclude<PadKey, 'select'>, IconName> = {
  up: 'chevron-up',
  down: 'chevron-down',
  left: 'chevron-left',
  right: 'chevron-right',
};
const ARROWS: Record<string, PadKey> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};
// the cross on a 3x3 grid: [row, column]
const CELL: Record<PadKey, string> = {
  up: 'col-start-2 row-start-1',
  left: 'col-start-1 row-start-2',
  select: 'col-start-2 row-start-2',
  right: 'col-start-3 row-start-2',
  down: 'col-start-2 row-start-3',
};
const ORDER: readonly PadKey[] = ['up', 'left', 'select', 'right', 'down'];

export function DirectionPad({
  label,
  onPress,
  disabled,
  size = 'md',
  labels,
  className,
  ...props
}: DirectionPadProps) {
  const [down, setDown] = useState<PadKey | null>(null);
  const words = { ...DEFAULT_LABELS, ...labels };

  const press = (key: PadKey) => {
    if (disabled) return;
    playSound('tick');
    onPress(key);
  };
  // arrow keys are shortcuts from any button of the pad; Enter and Space are the focused
  // button's own (native button behaviour), so Tab to "Up" and Enter gives Up
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, own: PadKey) => {
    if (disabled || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Enter' || e.key === ' ') {
      // a held key must not repeat the press
      if (e.repeat) e.preventDefault();
      else setDown(own);
      return;
    }
    const key = ARROWS[e.key];
    if (!key) return;
    e.preventDefault();
    // a held arrow is one press, not thirty a second
    if (e.repeat) return;
    setDown(key);
    press(key);
  };

  return (
    <fieldset
      {...props}
      aria-label={label}
      data-size={size}
      className={cn(
        'ui-direction-pad m-0 inline-grid w-fit min-w-0 grid-cols-3 grid-rows-3 gap-1.5 rounded-xl border border-solid border-border bg-sunken p-2',
        'forced-colors:border-[CanvasText]',
        className,
      )}
    >
      {ORDER.map((key) => (
        <Button
          key={key}
          variant="neutral"
          size="xl"
          disabled={disabled}
          aria-label={words[key]}
          data-key={key}
          data-pressed={down === key ? '' : undefined}
          onClick={() => press(key)}
          onKeyDown={(e) => onKeyDown(e, key)}
          onKeyUp={(e) => (e.key === 'Enter' || e.key === ' ' || ARROWS[e.key]) && setDown(null)}
          onBlur={(e) => {
            if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) setDown(null);
          }}
          className={cn(
            CELL[key],
            'p-0 data-[pressed]:bg-neutral-active',
            size === 'lg' ? 'size-18' : 'size-14',
            key === 'select' && 'text-[16px] font-semibold',
          )}
        >
          {key === 'select' ? (
            words.select
          ) : (
            <Icon name={ICON[key]} size={size === 'lg' ? 28 : 24} />
          )}
        </Button>
      ))}
    </fieldset>
  );
}
