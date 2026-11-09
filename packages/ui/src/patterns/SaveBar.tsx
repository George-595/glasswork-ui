import { type HTMLAttributes, useRef } from 'react';
import { Button } from '../components/button';
import { Card } from '../components/card';
import { Cluster } from '../components/layout/Cluster';
import { Text } from '../components/typography/Text';
import { useBottomInset } from '../lib/bottom-inset';
import { cn } from '../lib/cn';

/* SaveBar — the bar a settings or edit page shows while something is unsaved: "3 unsaved
   changes · Discard · Save". It sticks to the bottom of the viewport so Save is always in
   reach (above the phone tab bar, never under it) and renders nothing when `count` is 0. Its
   buttons are the standard size: 36px with a mouse, 48px on a touch screen.

   Announcing: a polite status line (screen readers only) is always mounted, so a change from
   0 to 1 is read ("1 unsaved change"); the visible text is not a second live region. The bar
   is a named region. When it goes away (after Save or Discard) the control that had focus
   goes with it: move focus to something stable, such as the page heading, in your handler.
   While `saving` the Save button says "Saving…" and is aria-disabled, so focus stays on it
   and a second press does nothing. */
export interface SaveBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** How many things are unsaved. 0 hides the bar. */
  count: number;
  /** What one is called. Default "change". */
  unit?: string;
  onSave: () => void;
  onDiscard: () => void;
  saving?: boolean;
  saveLabel?: string;
  discardLabel?: string;
}

export function SaveBar({
  count,
  unit = 'change',
  onSave,
  onDiscard,
  saving = false,
  saveLabel = 'Save',
  discardLabel = 'Discard',
  className,
  ...props
}: SaveBarProps) {
  const bar = useRef<HTMLDivElement>(null);
  useBottomInset(bar, count > 0);
  const noun = count === 1 ? unit : `${unit}s`;
  const message = count > 0 ? `${count} unsaved ${noun}` : '';
  return (
    <>
      <p role="status" className="ui-sr-only">
        {message}
      </p>
      {count > 0 && (
        <Card
          {...props}
          ref={bar}
          variant="raised"
          padding="sm"
          role="region"
          aria-label="Unsaved changes"
          className={cn(
            'ui-save-bar sticky bottom-[calc(env(safe-area-inset-bottom)+16px)] z-30 max-md:bottom-[calc(var(--bottom-nav-h,0px)+env(safe-area-inset-bottom)+8px)]',
            className,
          )}
        >
          <Cluster justify="between" gap={3}>
            <Text size="small" className="font-medium tabular-nums">
              {message}
            </Text>
            <Cluster gap={2}>
              <Button variant="ghost" onClick={onDiscard}>
                {discardLabel}
              </Button>
              <Button
                aria-disabled={saving || undefined}
                onClick={() => {
                  if (!saving) onSave();
                }}
              >
                {saving ? 'Saving…' : saveLabel}
              </Button>
            </Cluster>
          </Cluster>
        </Card>
      )}
    </>
  );
}
