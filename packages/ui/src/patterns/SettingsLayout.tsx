import { type ReactNode, type Ref, useId, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { Label } from '../components/input';
import { PageGrid } from '../components/layout/PageGrid';
import { NativeSelect } from '../components/native-select';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';

/* SettingsLayout — a settings screen: a section nav beside the content.
   - From 1024px the nav is a sticky vertical list of buttons (aria-current marks the chosen
     one, with a heavier weight and a bar, not colour alone) in a <nav>, and the content takes
     the rest of the width.
   - Below 1024px the nav is a native <select> over the content: the browser's own control is
     the best one on a phone.
   Both are in the DOM; CSS shows one. They drive the same value.

   Controlled (`value` + `onValueChange`) or not (`defaultValue`). `children` is the chosen
   section's content, or a function of the value. Each section is a SettingsSection. */
export interface SettingsNavItem {
  id: string;
  label: string;
  icon?: IconName;
}

export interface SettingsLayoutProps {
  sections: readonly SettingsNavItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Names the nav. Default "Settings sections". */
  label?: string;
  children?: ReactNode | ((value: string) => ReactNode);
  className?: string;
}

export function SettingsLayout({
  sections,
  value,
  defaultValue,
  onValueChange,
  label = 'Settings sections',
  children,
  className,
}: SettingsLayoutProps) {
  const [inner, setInner] = useState(defaultValue ?? sections[0]?.id ?? '');
  const current = value ?? inner;
  const panelId = useId();
  const selectId = useId();
  const choose = (id: string) => {
    setInner(id);
    onValueChange?.(id);
  };

  return (
    <PageGrid
      layout="sidebar-start"
      stackBelow="lg"
      gap={5}
      align="start"
      className={cn('ui-settings', className)}
    >
      <div className="ui-settings-nav flex flex-col gap-2 lg:sticky lg:top-6">
        <div className="flex flex-col gap-1.5 lg:hidden">
          <Label htmlFor={selectId}>Section</Label>
          <NativeSelect id={selectId} value={current} onChange={(e) => choose(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <nav aria-label={label} className="hidden lg:block">
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {sections.map((s) => {
              const active = s.id === current;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    aria-controls={panelId}
                    onClick={() => choose(s.id)}
                    className={cn(
                      'flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md border-0 border-s-2 border-solid bg-transparent px-3 py-1.5 text-start font-sans [font:var(--t-small)]',
                      'transition-colors duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
                      'hover:bg-hover active:bg-pressed focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
                      active
                        ? 'border-s-brand bg-selected font-semibold text-fg'
                        : 'border-s-transparent font-medium text-fg-muted hover:text-fg',
                    )}
                  >
                    {s.icon && <Icon name={s.icon} size={16} />}
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <div id={panelId} className="ui-settings-panel min-w-0">
        {typeof children === 'function' ? children(current) : children}
      </div>
    </PageGrid>
  );
}

export interface SettingsSectionProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons at the end of the header (Test connection). */
  actions?: ReactNode;
  /** Receives focus when the section is chosen; give it to move focus there. It is the
      heading's wrapper (tabIndex -1), not a tab stop. */
  headingRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
  className?: string;
}

/** One settings section: a Card with an h2 title, a line of help and the body. */
export function SettingsSection({
  title,
  description,
  actions,
  headingRef,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <Card className={cn('ui-settings-section', className)}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div ref={headingRef} tabIndex={-1} className="min-w-0 focus:outline-none">
            <CardTitle as="h2">{title}</CardTitle>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
