import { useId } from 'react';
import { cn } from '../lib/cn';
import { playSound } from '../sound';
import { Switch as SwitchControl } from './ui/switch';

/* Switch — an on/off setting that applies at once, on Radix Switch (shadcn):
   a <button role="switch" aria-checked>, so Space and Enter toggle it and
   assistive tech announces "on"/"off". The visible label wraps it, so the
   whole row is the target, but the switch is named by the label text alone
   (aria-labelledby) and the description is read once, as its description
   (aria-describedby). On a touch screen the row is at least 48px tall, because the track
   alone (36x20) is too small a mark to hit with a thumb; the label is the target. In the glass skin the track is glass. */
export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  /** A line under the label; tied to the switch with aria-describedby. */
  description?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  id,
  name,
  className,
}: SwitchProps) {
  const descId = useId();
  const labelId = useId();
  const autoId = useId();
  const switchId = id ?? autoId;
  return (
    <label
      htmlFor={switchId}
      className={cn(
        // the whole row is the target: 48px tall on a touch screen, the track centred in it
        'ui-switch-row relative inline-flex cursor-pointer items-start gap-2.5 data-[disabled]:cursor-not-allowed pointer-coarse:min-h-12 pointer-coarse:items-center',
        className,
      )}
      data-disabled={disabled || undefined}
    >
      <SwitchControl
        id={switchId}
        name={name}
        className="ui-switch"
        checked={checked}
        onCheckedChange={(next) => {
          playSound(next ? 'toggle-on' : 'toggle-off');
          onCheckedChange(next);
        }}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
      />
      <span className="ui-switch-text flex flex-col gap-0.5 pt-[3px] pointer-coarse:pt-0">
        <span
          id={labelId}
          className="ui-switch-label font-sans text-[13px] font-medium leading-[1.3] text-fg"
        >
          {label}
        </span>
        {description && (
          <span id={descId} className="ui-switch-description [font:var(--t-small)] text-fg-subtle">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
