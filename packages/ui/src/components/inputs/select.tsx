import { useSyncExternalStore } from 'react';
import { cn } from '../../lib/cn';
import { NativeSelect } from '../native-select';
import { Combobox } from './combobox';
import type { ComboOption } from './use-listbox';

/* Select — one choice from a list, styled like the kit on a desktop and the phone's own picker
   on a touch screen.

   - With a mouse it is a Combobox that opens on a click, Space, Enter or Down: the list is the
     kit's own surface (rows can carry a picture and a hint), and with `searchable` (the default
     once there are more than seven options) typing filters it.
   - On a touch screen (pointer: coarse) it is a NativeSelect: the phone's wheel or sheet is
     faster to use with a thumb and better known to its screen reader than anything we could draw.
   - Before the page knows which (the server, the first paint) it renders the native one, so the
     control works before hydration.

   Wrap it in a FormField like any field: the id, help and error reach whichever control is
   drawn. */
export interface SelectProps {
  options: readonly ComboOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  /** Shown when nothing is chosen. Default "Choose…". */
  placeholder?: string;
  /** Type to filter. Default: on when there are more than seven options. */
  searchable?: boolean;
  /** Name of the list for assistive tech. Default "Options". */
  listLabel?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  /** Force one form (tests, a kiosk). Default: native on a touch screen. */
  native?: boolean;
}

const COARSE = '(pointer: coarse)';
const subscribe = (cb: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(COARSE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
/** 'touch' | 'mouse' on the client, 'unknown' on the server. */
const pointer = () =>
  typeof window === 'undefined' || !window.matchMedia
    ? 'unknown'
    : window.matchMedia(COARSE).matches
      ? 'touch'
      : 'mouse';

export function Select({
  options,
  value,
  onValueChange,
  placeholder = 'Choose…',
  searchable,
  listLabel,
  native,
  className,
  ...field
}: SelectProps) {
  const kind = useSyncExternalStore(subscribe, pointer, () => 'unknown');
  const useNative = native ?? kind !== 'mouse';
  if (useNative)
    return (
      <NativeSelect
        {...field}
        value={value ?? ''}
        onChange={(e) => onValueChange(e.target.value === '' ? null : e.target.value)}
        className={cn('ui-select-native w-full', className)}
      >
        {value === null && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    );
  const search = searchable ?? options.length > 7;
  return (
    <Combobox
      {...field}
      options={options}
      value={value}
      onValueChange={(v) => v !== null && onValueChange(v)}
      listLabel={listLabel}
      placeholder={search ? `${placeholder} (type to search)` : placeholder}
      readOnly={!search}
      openOnClick
      className={cn('ui-select-custom cursor-pointer', className)}
    />
  );
}
