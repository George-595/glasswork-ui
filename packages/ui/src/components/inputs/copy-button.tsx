/* Adapted from Arc's copy-button (MIT, Elia Kuratli); see THIRD_PARTY_NOTICES.md. */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../icons/Icon';
import { Button, type ButtonVariant } from '../button';
import { Glyph } from './glyph';

/* CopyButton — copies text to the clipboard and says so. The result is spoken from a polite
   status line ("Copied to clipboard" or "Couldn't copy"), so it does not depend on the button's
   own text; the visible label and icon swap to "Copied" and a check for two seconds (nothing
   moves, so there is no motion to turn off). An `iconOnly` button keeps its `label` as its
   name throughout. Uses the async Clipboard API and falls back to a hidden textarea and
   `execCommand('copy')` where it is missing (an insecure origin). */
export interface CopyButtonProps {
  /** The text to copy, or a function that makes it when pressed. */
  text: string | (() => string);
  /** Accessible name and, unless `iconOnly`, the visible label. Default "Copy". */
  label?: string;
  copiedLabel?: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  iconOnly?: boolean;
  /** How long "Copied" shows, in ms. */
  resetAfter?: number;
  disabled?: boolean;
  className?: string;
  onCopy?: (text: string) => void;
  /** Called when neither the Clipboard API nor the fallback could copy. */
  onError?: () => void;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the textarea route
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'sr-only';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
  variant = 'outline',
  size = 'sm',
  iconOnly,
  resetAfter = 2000,
  disabled,
  className,
  onCopy,
  onError,
}: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const press = async () => {
    const value = typeof text === 'function' ? text() : text;
    const ok = await writeClipboard(value);
    if (ok) onCopy?.(value);
    else onError?.();
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), resetAfter);
  };

  const copied = state === 'copied';
  return (
    <>
      <Button
        variant={variant}
        size={iconOnly ? 'icon' : size}
        className={className}
        disabled={disabled}
        aria-label={iconOnly ? label : undefined}
        data-state={state}
        onClick={press}
      >
        {copied ? <Icon name="check" size={14} /> : <Glyph name="copy" size={14} />}
        {!iconOnly && (copied ? copiedLabel : label)}
      </Button>
      <span role="status" className="sr-only">
        {state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? "Couldn't copy" : ''}
      </span>
    </>
  );
}
