import type { ReactNode } from 'react';
import { Panel } from '../components/card';
import { PageGrid } from '../components/layout/PageGrid';
import { Section } from '../components/layout/Section';
import { Stack } from '../components/layout/Stack';
import { cn } from '../lib/cn';

/* ToolLayout — a calculator or generator: an inputs column and a results column. From 1024px
   they sit side by side (inputs a third, results two thirds) and the inputs stay in view while
   the results scroll (position: sticky); below that they stack, inputs first, which is also the
   reading and tab order. Each side is a named Section (h2), so the outline reads "Inputs",
   "Results".

   `announce` makes the results a polite live region: use it when results change as the reader
   types. (A figure that rolls in should announce only its final value, as RollingNumber does.) */
export interface ToolLayoutProps {
  /** The form controls. Rendered inside a Panel. */
  inputs: ReactNode;
  /** KPIs, a chart, a table: anything. */
  results: ReactNode;
  inputsTitle?: string;
  resultsTitle?: string;
  /** Buttons beside the Inputs title (Reset). */
  inputsActions?: ReactNode;
  /** Buttons beside the Results title (Copy, Export). */
  resultsActions?: ReactNode;
  /** Read out changes to the results politely. */
  announce?: boolean;
  className?: string;
}

export function ToolLayout({
  inputs,
  results,
  inputsTitle = 'Inputs',
  resultsTitle = 'Results',
  inputsActions,
  resultsActions,
  announce,
  className,
}: ToolLayoutProps) {
  return (
    <PageGrid
      layout="1-2"
      stackBelow="lg"
      gap={5}
      align="start"
      className={cn('ui-tool', className)}
    >
      <div className="ui-tool-inputs min-w-0 lg:sticky lg:top-6">
        <Section title={inputsTitle} actions={inputsActions} gap={3}>
          <Panel gap={4}>{inputs}</Panel>
        </Section>
      </div>
      <Section title={resultsTitle} actions={resultsActions} gap={3} className="ui-tool-results">
        <Stack gap={4} aria-live={announce ? 'polite' : undefined}>
          {results}
        </Stack>
      </Section>
    </PageGrid>
  );
}
