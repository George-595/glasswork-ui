import { type ReactNode, useState } from 'react';
import { useLiquidGlass } from '../glass/LiquidGlass';
import { cn } from '../lib/cn';
import { playSound } from '../sound';
import { TabsContent, TabsList, Tabs as TabsRoot, TabsTrigger } from './ui/tabs';

/* Tabs — the WAI-ARIA tabs pattern with automatic activation, on Radix Tabs
   (shadcn). Left/Right move and select (wrapping), Home/End jump to the
   ends. The selected tab is the one tab stop (roving tabindex); Radix's own
   default would make the tab list itself the stop, so the list is taken out
   of the tab order here. Every panel stays rendered and the inactive ones
   are `hidden`, so aria-controls always points at a real element and panel
   state survives a switch. A panel is focusable (APG), so content without
   controls is reachable.

   In the glass skin the tab list is a LiquidGlass track with a glass pill
   on the active tab. Controlled with `value` + onValueChange, or
   uncontrolled with defaultValue. */
export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  tabs: readonly TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Names the tab list for assistive tech. */
  label: string;
  className?: string;
}

export function Tabs({ tabs, value, defaultValue, onValueChange, label, className }: TabsProps) {
  const [inner, setInner] = useState(defaultValue ?? tabs[0]?.id ?? '');
  const current = value ?? inner;
  const {
    ref: glassRef,
    props: glassProps,
    layers: glassLayers,
  } = useLiquidGlass<HTMLDivElement>({
    fill: 'surface',
    band: 6,
    refraction: 12,
  });

  const select = (id: string) => {
    if (id !== current) playSound('tick');
    if (value === undefined) setInner(id);
    onValueChange?.(id);
  };

  return (
    <TabsRoot
      value={current}
      onValueChange={select}
      activationMode="automatic"
      className={cn('ui-tabs flex flex-col', className)}
    >
      <TabsList
        ref={glassRef}
        aria-label={label}
        // the selected tab is the tab stop, not the list (overrides Radix's 0)
        tabIndex={undefined}
        className={cn('ui-tablist self-start', glassProps.className)}
        data-lg={glassProps['data-lg']}
        style={glassProps.style}
      >
        {glassLayers}
        {tabs.map((t) => (
          <TabsTrigger
            key={t.id}
            value={t.id}
            className="ui-tab"
            tabIndex={t.id === current ? 0 : -1}
          >
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent
          key={t.id}
          value={t.id}
          forceMount
          hidden={t.id !== current}
          className="ui-tabpanel"
        >
          {t.content}
        </TabsContent>
      ))}
    </TabsRoot>
  );
}
