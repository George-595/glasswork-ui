import { createContext, type ReactNode, useContext } from 'react';
import { Card, Grid, GridItem, Section } from '~/core/ui';

/* The two layout pieces every kit section is built from, so all nine read the same way.
   Section: an anchor target with an h2 (the in-page nav moves focus to it).
   Block: one titled specimen inside a section (h3), with an optional one-line note. */

/* Whether the page is previewing its loading states. Loading regions are aria-busy, which a
   screen reader (and the shell's a11y gate) reads as "this page is still loading", so they are
   shown only when the reader switches them on; the rest of the time each specimen shows its
   loaded form. */
export const KitLoadingContext = createContext(false);
export const useKitLoading = () => useContext(KitLoadingContext);

export interface KitSectionProps {
  id: string;
  title: string;
  intro: string;
  children: ReactNode;
}

export function KitSection({ id, title, intro, children }: KitSectionProps) {
  return (
    <Section id={id} title={title} titleSize={2} description={intro} gap={4}>
      <Grid minItemWidth={352} gap={4} align="start">
        {children}
      </Grid>
    </Section>
  );
}

export interface KitBlockProps {
  title: string;
  note?: string;
  /** Spans the full section width instead of one grid column. */
  wide?: boolean;
  children: ReactNode;
}

export function KitBlock({ title, note, wide, children }: KitBlockProps) {
  const block = (
    <Card padding="md">
      <Section level={3} title={title} description={note} gap={4}>
        {children}
      </Section>
    </Card>
  );
  return wide ? <GridItem span="full">{block}</GridItem> : block;
}
