import { useEffect, useState } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { type StrengthScore, scorePassword } from './password-strength';

/* PasswordStrength — a meter and a word under a password field. It informs; it never blocks
   (the server's rules decide), and says "Strength: Good", not just a colour: four segments
   fill (a count), the word is written, and the segments take a danger / warning / info /
   success role only as a reinforcement. The meter is a `role="meter"` named "Password
   strength". Changes are announced politely through a status line that waits `debounceMs`
   after typing stops, so a screen reader hears the result, not every keystroke. The optional
   `requirements` checklist lists "At least N characters" and the character kinds; each item
   says "Met" or "Not met" in words with an icon. Hidden until something is typed, except the
   checklist, which is always useful. */
export interface PasswordStrengthProps {
  value: string;
  /** The length the app asks for. Default 10. */
  minLength?: number;
  /** Show the checklist. */
  requirements?: boolean;
  /** Pause before the polite announcement. Default 600. */
  debounceMs?: number;
  className?: string;
  id?: string;
}

const FILL: Record<StrengthScore, string> = {
  0: 'bg-sunken',
  1: 'bg-danger',
  2: 'bg-warning',
  3: 'bg-info',
  4: 'bg-success',
};

export function PasswordStrength({
  value,
  minLength = 10,
  requirements = false,
  debounceMs = 600,
  className,
  id,
}: PasswordStrengthProps) {
  const result = scorePassword(value, minLength);
  const [announced, setAnnounced] = useState(
    result.score === 0 ? '' : `Password strength: ${result.label}`,
  );

  useEffect(() => {
    const text = result.score === 0 ? '' : `Password strength: ${result.label}. ${result.hint}`;
    const timer = setTimeout(() => setAnnounced(text.trim()), debounceMs);
    return () => clearTimeout(timer);
  }, [result.score, result.label, result.hint, debounceMs]);

  const items: Array<[string, boolean]> = [
    [`At least ${minLength} characters`, result.checks.length],
    ['A lower-case letter', result.checks.lower],
    ['An upper-case letter', result.checks.upper],
    ['A number', result.checks.number],
    ['A symbol', result.checks.symbol],
  ];

  return (
    <div id={id} className={cn('ui-password-strength flex flex-col gap-2', className)}>
      <div className="flex items-center gap-3">
        {/* biome-ignore lint/a11y/useSemanticElements: <meter> cannot draw four segments */}
        <div
          role="meter"
          aria-label="Password strength"
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={result.score}
          aria-valuetext={result.score === 0 ? 'Nothing entered' : result.label}
          className="grid h-2 flex-1 grid-cols-4 gap-1"
        >
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              data-filled={n <= result.score || undefined}
              className={cn(
                'rounded-pill border border-solid border-border-input forced-colors:border-[CanvasText]',
                n <= result.score ? FILL[result.score] : 'bg-sunken',
                'forced-colors:data-[filled]:bg-[Highlight]',
              )}
            />
          ))}
        </div>
        <span
          aria-hidden="true"
          className="min-w-16 text-right text-fg [font:var(--t-small)]"
          data-testid="strength-label"
        >
          <span className="font-semibold">{result.score === 0 ? '' : result.label}</span>
        </span>
      </div>
      {result.score > 0 && result.hint && (
        <p className="m-0 text-fg-muted [font:var(--t-small)]">{result.hint}</p>
      )}
      {requirements && (
        <ul aria-label="Password requirements" className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map(([text, met]) => (
            <li
              key={text}
              data-met={met || undefined}
              className="flex items-center gap-2 text-fg [font:var(--t-small)]"
            >
              <Icon
                name={met ? 'check' : 'minus'}
                size={14}
                className={met ? 'text-success' : 'text-fg-muted'}
              />
              <span>{text}</span>
              <span className="ui-sr-only">{met ? ': met' : ': not met'}</span>
            </li>
          ))}
        </ul>
      )}
      <span role="status" className="ui-sr-only">
        {announced}
      </span>
    </div>
  );
}
