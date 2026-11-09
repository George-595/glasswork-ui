import {
  type FormEvent,
  forwardRef,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '../components/button';
import { fieldClasses } from '../components/input';
import { useMergedRef } from '../components/useMergedRef';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { SeaGlass } from '../seaglass/SeaGlass';
import { SeaGlassStage } from '../seaglass/SeaGlassStage';
import { playSound } from '../sound';
import { StopGlyph } from './icons';

/* Adapted from BoardUI's agent-composer (MIT, Mertcan Dundar Esmergul); see
   THIRD_PARTY_NOTICES.md.
   Composer — where the person writes to the agent: an auto-growing textarea and one round
   button beside it.
   - Enter sends; Shift+Enter inserts a new line. Enter does nothing while an IME is composing,
     while the text is blank, while `disabled` or while `streaming`.
   - While `streaming` the button is Stop ("Stop generating", calls `onStop`); otherwise it is
     Send. Send is `aria-disabled` when there is nothing to send, so it keeps focus.
   - The field grows with its text up to `maxRows`, then scrolls.
   - The hint under the field names the keys and, with `maxLength`, counts characters
     (a polite status that only speaks as the limit gets close, so typing is not narrated).
   Works controlled (`value` + `onValueChange`) or uncontrolled. After a send the field is
   cleared (uncontrolled) and keeps focus.
   `seaGlass`: the field and its button lie on a periwinkle glass pebble (a paperless
   SeaGlassStage, so it sits on any page), which glows and pulses while `streaming`. The field
   loses its own box; the pebble shows the focus ring. */
export interface ComposerProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'onChange'> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Called with the trimmed text on Enter or the Send button. */
  onSend: (text: string) => void;
  /** Called by the Stop button while `streaming`. */
  onStop?: () => void;
  /** A reply is arriving: the button becomes Stop and sending is paused. */
  streaming?: boolean;
  disabled?: boolean;
  /** Visible-to-assistive-tech label of the field. Default "Message". */
  label?: string;
  /** Rows before the field scrolls. Default 6. */
  maxRows?: number;
  /** Shows "n / max" and caps the text. */
  maxLength?: number;
  /** Replaces the default key hint. */
  hint?: string;
  /** Draw the field and button on a sea glass pebble that pulses while `streaming`. */
  seaGlass?: boolean;
}

const LINE_PX = 20;
const NEAR_LIMIT = 0.9;

export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  {
    value: valueProp,
    defaultValue = '',
    onValueChange,
    onSend,
    onStop,
    streaming = false,
    disabled = false,
    label = 'Message',
    maxRows = 6,
    maxLength,
    hint,
    seaGlass = false,
    placeholder = 'Ask anything',
    className,
    onKeyDown,
    ...props
  },
  ref,
) {
  const [inner, setInner] = useState(defaultValue);
  const value = valueProp ?? inner;
  const field = useRef<HTMLTextAreaElement>(null);
  const merged = useMergedRef(field, ref);
  const id = useId();
  const hintId = `${id}-hint`;

  const set = (next: string) => {
    if (valueProp === undefined) setInner(next);
    onValueChange?.(next);
  };

  // grow with the text: collapse, measure, then set the height (capped; beyond it, scroll)
  useLayoutEffect(() => {
    const el = field.current;
    if (!el || el.value !== value) return;
    el.style.height = 'auto';
    const cap = maxRows * LINE_PX + 14;
    el.style.height = `${Math.min(el.scrollHeight, cap)}px`;
    el.style.overflowY = el.scrollHeight > cap ? 'auto' : 'hidden';
  }, [value, maxRows]);

  const text = value.trim();
  const canSend = text !== '' && !disabled && !streaming;

  const send = () => {
    if (!canSend) return;
    playSound('send');
    onSend(text);
    if (valueProp === undefined) setInner('');
    field.current?.focus();
  };

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  const near = maxLength !== undefined && value.length >= maxLength * NEAR_LIMIT;

  const fieldRow = (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        {...props}
        id={id}
        ref={merged}
        rows={1}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-describedby={hintId}
        onChange={(e) => set(e.target.value)}
        onKeyDown={keyDown}
        className={cn(
          'ui-input ui-textarea min-h-9 min-w-0 flex-1 resize-none px-3 py-[7px]',
          seaGlass
            ? 'border-0 bg-transparent text-fg outline-none placeholder:text-fg-muted'
            : fieldClasses,
          'rounded-lg placeholder:opacity-100',
          !seaGlass && 'placeholder:text-fg-subtle',
        )}
      />
      {streaming ? (
        <Button
          variant="neutral"
          size="icon"
          aria-label="Stop generating"
          onClick={onStop}
          className="shrink-0 rounded-full"
        >
          <StopGlyph size={16} />
        </Button>
      ) : (
        <Button
          type="submit"
          variant="primary"
          size="icon"
          aria-label="Send message"
          aria-disabled={!canSend || undefined}
          className="shrink-0 rounded-full"
        >
          <Icon name="arrow-up" size={16} />
        </Button>
      )}
    </>
  );

  return (
    <form
      onSubmit={submit}
      className={cn('ui-composer flex w-full flex-col gap-1.5', className)}
      data-streaming={streaming || undefined}
    >
      {seaGlass ? (
        <SeaGlassStage paper={false} className="px-1 pt-1 pb-3">
          <SeaGlass
            tint="periwinkle"
            pad="sm"
            pulse={streaming}
            justify="between"
            className="items-end has-[textarea:focus-visible]:[box-shadow:var(--ring)]"
          >
            {fieldRow}
          </SeaGlass>
        </SeaGlassStage>
      ) : (
        <div className="flex items-end gap-2">{fieldRow}</div>
      )}
      <p
        id={hintId}
        className="m-0 flex justify-between gap-3 font-sans text-[12px] leading-[1.3] text-fg-subtle"
      >
        <span>{hint ?? 'Enter to send, Shift+Enter for a new line'}</span>
        {maxLength !== undefined && (
          <span className={cn('tabular-nums', near && 'text-warning')}>
            {value.length} / {maxLength}
          </span>
        )}
      </p>
      <span role="status" className="sr-only">
        {near && maxLength !== undefined
          ? `${maxLength - value.length} ${maxLength - value.length === 1 ? 'character' : 'characters'} left`
          : ''}
      </span>
    </form>
  );
});
