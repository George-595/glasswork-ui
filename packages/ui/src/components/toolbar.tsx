import { ToggleGroup as ToggleGroupRoot, Toggle as ToggleRoot } from '@ui-sdk/react/toggle';
import {
  ToolbarButton,
  ToolbarGroup,
  Toolbar as ToolbarRoot,
  ToolbarSeparator,
} from '@ui-sdk/react/toolbar';
import { Fragment, useState } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* Toolbar — a row of tools that is one tab stop, on Vercel's UI SDK toolbar
   (@ui-sdk/react/toolbar): Tab enters and leaves, Left/Right move between tools (wrapping),
   Home/End jump. Items as data:
   - `toggle`: on or off (Bold), aria-pressed;
   - `choice`: one of a few (align left, centre, right): a toggle group;
   - `button`: a one-off action (Insert link);
   - `separator`.
   Every tool is an icon with its label as the accessible name; the label also shows as a
   small caption above the tool on hover and focus (for sight only), with its shortcut.
   A pressed tool is a soft brand chip with a brand icon, and it pops a little as it turns on.

   `floating` lifts it into a pill with a stronger shadow, for a toolbar that hovers over a
   canvas or a text selection. */
export type ToolbarItem =
  | {
      type: 'toggle';
      id: string;
      label: string;
      icon: IconName;
      defaultPressed?: boolean;
      shortcut?: string;
    }
  | { type: 'button'; id: string; label: string; icon: IconName; shortcut?: string }
  | {
      type: 'choice';
      id: string;
      label: string;
      defaultValue: string;
      options: readonly { value: string; label: string; icon: IconName }[];
    }
  | { type: 'separator'; id: string };

export interface ToolbarProps {
  items: readonly ToolbarItem[];
  /** Names the toolbar: "Text formatting". */
  label: string;
  onToggle?: (id: string, pressed: boolean) => void;
  onChoice?: (id: string, value: string) => void;
  onAction?: (id: string) => void;
  floating?: boolean;
  className?: string;
}

const tool =
  'group/tool relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-fg-muted outline-none pointer-coarse:size-12 transition-[background-color,color,scale] duration-(--dur-fast) ease-(--ease-out) hover:bg-hover hover:text-fg focus-visible:[box-shadow:var(--ring-inset)] active:scale-95 motion-reduce:transition-none data-pressed:bg-brand-soft data-pressed:text-brand data-disabled:cursor-not-allowed data-disabled:text-disabled-fg';

function Caption({ label, shortcut }: { label: string; shortcut?: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-full start-1/2 z-10 mb-2 -translate-x-1/2 rounded-sm border border-solid border-border bg-overlay px-2 py-1 font-sans text-[11px] font-medium whitespace-nowrap text-fg opacity-0 [box-shadow:var(--elev-2)] transition-opacity duration-(--dur-fast) group-hover/tool:opacity-100 group-focus-visible/tool:opacity-100 rtl:translate-x-1/2"
    >
      {label}
      {shortcut && <span className="ms-1.5 font-mono text-fg-muted">{shortcut}</span>}
    </span>
  );
}

function Pop({ icon, on }: { icon: IconName; on: boolean }) {
  return (
    <Icon
      name={icon}
      size={17}
      className={cn(
        'transition-transform duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none',
        on && 'animate-[ui-pop_var(--dur-slow)_var(--ease-out)] motion-reduce:animate-none',
      )}
    />
  );
}

function ToggleTool({
  item,
  onToggle,
}: {
  item: Extract<ToolbarItem, { type: 'toggle' }>;
  onToggle?: (id: string, pressed: boolean) => void;
}) {
  const [on, setOn] = useState(item.defaultPressed ?? false);
  return (
    <ToggleRoot
      aria-label={item.label}
      pressed={on}
      onPressedChange={(p: boolean) => {
        setOn(p);
        playSound(p ? 'toggle-on' : 'toggle-off');
        onToggle?.(item.id, p);
      }}
      className={tool}
    >
      <Pop icon={item.icon} on={on} />
      <Caption label={item.label} shortcut={item.shortcut} />
    </ToggleRoot>
  );
}

export function Toolbar({
  items,
  label,
  onToggle,
  onChoice,
  onAction,
  floating = false,
  className,
}: ToolbarProps) {
  return (
    <ToolbarRoot
      aria-label={label}
      loop
      className={cn(
        'ui-toolbar inline-flex max-w-full min-w-0 flex-wrap items-center gap-0.5 border border-solid border-border bg-surface p-1 glass-chrome',
        floating
          ? 'rounded-pill px-1.5 [box-shadow:var(--elev-3)]'
          : 'rounded-lg [box-shadow:var(--elev-1)]',
        className,
      )}
      data-floating={floating || undefined}
    >
      {items.map((it) => {
        switch (it.type) {
          case 'separator':
            return (
              <ToolbarSeparator
                key={it.id}
                className="mx-1 h-5 w-px shrink-0 self-center bg-border-subtle"
              />
            );
          case 'toggle':
            return <ToggleTool key={it.id} item={it} onToggle={onToggle} />;
          case 'choice':
            return (
              <ToolbarGroup key={it.id} className="contents">
                <ToggleGroupRoot
                  aria-label={it.label}
                  defaultValue={[it.defaultValue]}
                  onValueChange={(next: string[]) => {
                    const v = next[0];
                    if (v) {
                      playSound('tick');
                      onChoice?.(it.id, v);
                    }
                  }}
                  className="inline-flex items-center gap-0.5"
                >
                  {it.options.map((o) => (
                    <ToggleRoot key={o.value} value={o.value} aria-label={o.label} className={tool}>
                      <Icon name={o.icon} size={17} />
                      <Caption label={o.label} />
                    </ToggleRoot>
                  ))}
                </ToggleGroupRoot>
              </ToolbarGroup>
            );
          default:
            return (
              <Fragment key={it.id}>
                <ToolbarButton
                  aria-label={it.label}
                  onClick={() => onAction?.(it.id)}
                  className={tool}
                >
                  <Icon name={it.icon} size={17} />
                  <Caption label={it.label} shortcut={it.shortcut} />
                </ToolbarButton>
              </Fragment>
            );
        }
      })}
    </ToolbarRoot>
  );
}
