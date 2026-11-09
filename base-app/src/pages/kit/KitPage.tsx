import { useEffect, useState } from 'react';
import { hrefFor } from '~/core/router';
import {
  buttonAttrs,
  Cluster,
  Page,
  PageGrid,
  SegmentedControl,
  SKINS,
  type Skin,
  Stack,
  Switch,
  THEMES,
  type Theme,
  useAppTheme,
} from '~/core/ui';
import { ButtonsSection, DisplaySection, InputsSection } from './KitControls';
import { ChartsSection, EffectsSection, TablesSection } from './KitData';
import { KitLoadingContext } from './KitParts';
import { CardsSection, FeedbackSection, OverlaysSection } from './KitSurfaces';
import { AiSection } from './sections/KitAi';
import { PickersSection } from './sections/KitInputs';
import { SeaGlassSection } from './sections/KitSeaGlass';
import { SoundsSection } from './sections/KitSounds';
import { VizSection } from './sections/KitViz';

/* The kit page: a living reference of every @apps/ui component in its states, for signed-in
   users. It is where the look of both skins and both modes is judged, so a skin and mode switcher
   sits at the top (the same shared theme state as the topbar). Fourteen sections, an in-page nav.

   The nav links are real anchors to this route (so they work in a new tab) whose click is
   taken over to scroll to the section and move focus to its heading: the app routes on the
   URL hash, so a bare "#buttons" href would navigate away.

   Toasts show through the app's one Toaster (App.tsx). */

const SECTIONS = [
  { id: 'buttons', label: 'Buttons' },
  { id: 'inputs', label: 'Inputs and choices' },
  { id: 'pickers', label: 'Pickers and chips' },
  { id: 'display', label: 'Badges and avatars' },
  { id: 'cards', label: 'Cards and tiles' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'tables', label: 'Tables' },
  { id: 'charts', label: 'Charts' },
  { id: 'viz', label: 'Data visualisation' },
  { id: 'effects', label: 'Effects' },
  { id: 'sea-glass', label: 'Sea glass' },
  { id: 'sounds', label: 'Sounds' },
  { id: 'ai', label: 'AI interface' },
] as const;

const SKIN_LABEL: Record<Skin, string> = { enterprise: 'Enterprise', glass: 'Glass' };
const THEME_LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark' };

function goTo(id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  section.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const heading = section.querySelector<HTMLElement>('h2');
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

/* The section nearest the top of the viewport, for the nav's aria-current. */
function useActiveSection(): string {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          seen.set(
            e.target.id,
            e.isIntersecting ? e.boundingClientRect.top : Number.POSITIVE_INFINITY,
          );
        const first = SECTIONS.find((s) =>
          Number.isFinite(seen.get(s.id) ?? Number.POSITIVE_INFINITY),
        );
        if (first) setActive(first.id);
      },
      { rootMargin: '-10% 0px -70% 0px' },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return active;
}

export default function KitPage() {
  const { skin, setSkin, theme, setTheme } = useAppTheme();
  const active = useActiveSection();
  const [loading, setLoading] = useState(false);

  return (
    <Page
      eyebrow="Design system"
      title="Kit"
      description={
        <>
          Every component in @apps/ui, in the states you will meet it.
        </>
      }
      actions={
        <Cluster gap={3}>
          <SegmentedControl
            label="Skin"
            size="sm"
            value={skin}
            onValueChange={(v) => setSkin(SKINS.find((s) => s === v) ?? 'enterprise')}
            options={SKINS.map((s) => ({ value: s, label: SKIN_LABEL[s] }))}
          />
          <SegmentedControl
            label="Mode"
            size="sm"
            value={theme}
            onValueChange={(v) => setTheme(THEMES.find((t) => t === v) ?? 'light')}
            options={THEMES.map((t) => ({ value: t, label: THEME_LABEL[t] }))}
          />
          <Switch label="Preview loading states" checked={loading} onCheckedChange={setLoading} />
        </Cluster>
      }
    >
      <KitLoadingContext.Provider value={loading}>
        <PageGrid layout="sidebar-start" stackBelow="lg" gap={6} align="start" stickyAside>
          <nav aria-label="Kit sections">
            <Stack gap={1}>
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={hrefFor('/kit')}
                  {...buttonAttrs(active === s.id ? 'secondary' : 'ghost', 'sm')}
                  aria-current={active === s.id ? 'location' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    goTo(s.id);
                  }}
                >
                  {s.label}
                </a>
              ))}
            </Stack>
          </nav>

          <Stack gap={7}>
            <ButtonsSection />
            <InputsSection />
            <PickersSection />
            <DisplaySection />
            <CardsSection />
            <FeedbackSection />
            <OverlaysSection />
            <TablesSection />
            <ChartsSection />
            <VizSection />
            <EffectsSection />
            <SeaGlassSection />
            <SoundsSection />
            <AiSection />
          </Stack>
        </PageGrid>
      </KitLoadingContext.Provider>
    </Page>
  );
}
