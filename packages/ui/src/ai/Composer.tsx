import {
  type FormEvent,
  forwardRef,
  type KeyboardEvent,
  type ReactNode,
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
import { MicGlyph, PaperclipGlyph, StopGlyph } from './icons';

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
  /** Shows a paperclip button; called with the files the person picks (or pastes). */
  onAttach?: (files: File[]) => void;
  /** Files waiting to go with the message, shown as chips above the field. */
  attachments?: readonly ComposerAttachment[];
  /** Called by a chip's remove button. */
  onRemoveAttachment?: (id: string) => void;
  /** `/` at the start of the text opens this list. Picking one fills in `/<value> `. */
  commands?: readonly ComposerSuggestion[];
  /** `@` before a word opens this list. Picking one fills in `@<value> `. */
  mentions?: readonly ComposerSuggestion[];
  /** Shows a microphone button that toggles dictation. */
  onVoice?: () => void;
  /** Dictation is on: the microphone button is pressed and pulses. */
  listening?: boolean;
}

export interface ComposerAttachment {
  id: string;
  name: string;
  /** e.g. "24 KB". */
  detail?: string;
  /** A small preview (an <img>), else a paperclip. */
  preview?: ReactNode;
}

export interface ComposerSuggestion {
  value: string;
  label?: string;
  description?: string;
  /** A picture at the start of the row (an Avatar for a mention). */
  leading?: ReactNode;
}

/** The `/command` or `@mention` being typed at the caret, if any. */
export function suggestionQuery(
  text: string,
  caret: number,
): { kind: '/' | '@'; query: string; start: number } | null {
  const before = text.slice(0, caret);
  const slash = /^\/([\w-]*)$/.exec(before);
  if (slash) return { kind: '/', query: slash[1] ?? '', start: 0 };
  const at = /(^|\s)@([\w.-]*)$/.exec(before);
  if (at) return { kind: '@', query: at[2] ?? '', start: before.length - (at[2]?.length ?? 0) - 1 };
  return null;
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
    onAttach,
    attachments = [],
    onRemoveAttachment,
    commands,
    mentions,
    onVoice,
    listening = false,
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

  const filePick = useRef<HTMLInputElement>(null);
  const listId = `${id}-suggest`;
  const [caret, setCaret] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const set = (next: string) => {
    if (valueProp === undefined) setInner(next);
    onValueChange?.(next);
  };

  const q = suggestionQuery(value, caret);
  const source = q?.kind === '/' ? commands : q?.kind === '@' ? mentions : undefined;
  const matches =
    q && source
      ? source
          .filter((o) =>
            `${o.value} ${o.label ?? ''}`.toLowerCase().includes(q.query.toLowerCase()),
          )
          .slice(0, 8)
      : [];
  const qKey = q ? `${q.kind}${q.start}` : null;
  const suggesting = matches.length > 0 && qKey !== dismissed;
  const active = Math.min(activeIdx, Math.max(0, matches.length - 1));

  const choose = (o: ComposerSuggestion) => {
    if (!q) return;
    const next = `${value.slice(0, q.start)}${q.kind}${o.value} ${value.slice(caret)}`;
    const at = q.start + o.value.length + 2;
    set(next);
    setCaret(at);
    setActiveIdx(0);
    requestAnimationFrame(() => field.current?.setSelectionRange(at, at));
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
    if (suggesting) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = matches.length;
        setActiveIdx((active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.nativeEvent.isComposing) {
        e.preventDefault();
        const o = matches[active];
        if (o) choose(o);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(qKey);
        return;
      }
    }
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
      {onAttach && (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Attach files"
            disabled={disabled}
            onClick={() => filePick.current?.click()}
            className="shrink-0 rounded-full"
          >
            <PaperclipGlyph size={16} />
          </Button>
          <input
            ref={filePick}
            type="file"
            multiple
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length > 0) onAttach(picked);
              e.target.value = '';
            }}
          />
        </>
      )}
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
        onChange={(e) => {
          set(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setActiveIdx(0);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        onPaste={(e) => {
          const pasted = Array.from(e.clipboardData.files);
          if (onAttach && pasted.length > 0) {
            e.preventDefault();
            onAttach(pasted);
          }
        }}
        aria-controls={suggesting ? listId : undefined}
        aria-activedescendant={suggesting ? `${listId}-${active}` : undefined}
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
      {onVoice && (
        <Button
          variant={listening ? 'primary' : 'ghost'}
          size="icon"
          aria-label="Dictate"
          aria-pressed={listening}
          disabled={disabled}
          onClick={onVoice}
          className={cn('shrink-0 rounded-full', listening && 'ui-composer-listening')}
        >
          <MicGlyph size={16} />
        </Button>
      )}
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
      {attachments.length > 0 && (
        <ul aria-label="Attachments" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="ui-composer-attachment flex max-w-60 items-center gap-2 rounded-md border border-solid border-border bg-surface py-1 ps-1 pe-0.5 text-[12.5px]"
            >
              <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-sm bg-sunken text-fg-muted [&>img]:size-full [&>img]:object-cover">
                {a.preview ?? <PaperclipGlyph size={14} />}
              </span>
              <span className="flex min-w-0 flex-col leading-[1.25]">
                <span className="truncate text-fg">{a.name}</span>
                {a.detail && <span className="text-[11.5px] text-fg-muted">{a.detail}</span>}
              </span>
              {onRemoveAttachment && (
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => onRemoveAttachment(a.id)}
                  className="inline-grid size-7 pointer-coarse:size-12 shrink-0 cursor-pointer place-items-center rounded-sm border-0 bg-transparent text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
                >
                  <Icon name="x" size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        {suggesting && (
          <div
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={q?.kind === '/' ? 'Commands' : 'People'}
            onMouseDown={(e) => e.preventDefault()}
            className="ui-composer-suggest absolute inset-x-0 bottom-full z-50 mb-1.5 max-h-64 overflow-auto rounded-md border border-solid border-border bg-overlay p-1 text-fg [box-shadow:var(--elev-2)] glass-chrome"
          >
            {matches.map((o, i) => (
              <div
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                tabIndex={-1}
                aria-selected={i === active}
                data-active={i === active || undefined}
                onMouseMove={() => i !== active && setActiveIdx(i)}
                onClick={() => choose(o)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    choose(o);
                  }
                }}
                className="flex cursor-pointer items-center gap-2 rounded-sm border border-solid border-transparent px-2 py-1.5 text-[13px] data-[active]:border-brand data-[active]:bg-hover"
              >
                {o.leading && (
                  <span aria-hidden="true" className="grid shrink-0 place-items-center">
                    {o.leading}
                  </span>
                )}
                <span className="font-mono text-fg">
                  {q?.kind}
                  {o.value}
                </span>
                {(o.label || o.description) && (
                  <span className="min-w-0 flex-1 truncate text-[12px] text-fg-muted">
                    {o.description ?? o.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
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
          <div className="ui-composer-box flex items-end gap-1.5 rounded-xl">{fieldRow}</div>
        )}
      </div>
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
        {suggesting ? `${matches.length} suggestions, up and down to choose, Enter to pick. ` : ''}
        {near && maxLength !== undefined
          ? `${maxLength - value.length} ${maxLength - value.length === 1 ? 'character' : 'characters'} left`
          : ''}
      </span>
    </form>
  );
});
