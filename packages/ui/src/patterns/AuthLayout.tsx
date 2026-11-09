import type { ReactNode } from 'react';
import { Stack } from '../components/layout/Stack';
import { Heading } from '../components/typography/Heading';
import { Text } from '../components/typography/Text';
import { cn } from '../lib/cn';
import { SeaGlass } from '../seaglass/SeaGlass';
import { SeaGlassStage } from '../seaglass/SeaGlassStage';

/* AuthLayout — the sign-in shell, one structure and two looks (the skin switches them in CSS,
   so the markup and the tab order are the same):
   - enterprise: from 1024px two columns, a brand panel (`brand`, `aside`) beside the form
     panel; on a phone just the form with the brand above it;
   - glass: one centred liquid-glass card over the page backdrop (`backdrop` is decorative and
     sits behind it), the brand reduced to a mark above the title.

   Slots: `brand` (a logo and name), `aside` (what the product is: a feature list, only in the
   enterprise panel), `title` (the page's one <h1>), `description`, `notice` (an error summary
   or a banner, above the form), `form`, `footer` (links, terms).

   `seaGlass` swaps either look for the sea glass one: the page is sunlit paper (moonlit in dark
   mode), the form lies on a large clear pebble in the middle, and a few coloured pebbles lie
   around it (decorative, hidden below 768px). `backdrop` is then unused.

   It is the page's <main id="main">; a page that uses it has no shell around it. */
export interface AuthLayoutProps {
  brand?: ReactNode;
  aside?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  notice?: ReactNode;
  form: ReactNode;
  footer?: ReactNode;
  /** Decorative, behind the glass card (a shader). Hidden from assistive tech. */
  backdrop?: ReactNode;
  /** The sea glass look: the form on a glass pebble on paper (SeaGlassStage). */
  seaGlass?: boolean;
  className?: string;
}

/* The pebbles around the form: where they lie (as a share of the page) and their colour. */
const PEBBLES = [
  { tint: 'coral', shape: 'circle', at: 'left-[9%] top-[12%] size-24' },
  { tint: 'periwinkle', shape: 'card', at: 'left-[5%] top-[46%] h-28 w-44' },
  { tint: 'amber', shape: 'tile', at: 'bottom-[10%] left-[15%] h-16 w-24' },
  { tint: 'aqua', shape: 'pill', at: 'right-[8%] top-[14%] h-16 w-48' },
  { tint: 'orchid', shape: 'card', at: 'right-[11%] top-[50%] size-32' },
  { tint: 'seafoam', shape: 'circle', at: 'bottom-[12%] right-[6%] size-20' },
] as const;

function SeaGlassAuth({
  brand,
  title,
  description,
  notice,
  form,
  footer,
  className,
}: Omit<AuthLayoutProps, 'aside' | 'backdrop' | 'seaGlass'>) {
  return (
    <SeaGlassStage
      as="main"
      id="main"
      tabIndex={-1}
      className={cn(
        'ui-auth grid min-h-dvh grid-cols-1 place-items-center overflow-hidden p-4 focus:outline-none sm:p-6',
        // clear a phone's notch and home bar (live with viewport-fit=cover)
        'pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-[max(1.5rem,env(safe-area-inset-top))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {PEBBLES.map((p) => (
        <SeaGlass
          key={p.tint}
          aria-hidden="true"
          tint={p.tint}
          shape={p.shape}
          pad="none"
          className={cn('absolute hidden md:flex', p.at)}
        />
      ))}
      <SeaGlass shape="card" pad="none" thickness="thick" className="w-full max-w-md">
        <Stack gap={6} className="w-full p-6 sm:p-10">
          {brand && <div className="ui-auth-mark">{brand}</div>}
          <Stack gap={2}>
            <Heading level={1} size={2}>
              {title}
            </Heading>
            {description && <Text tone="muted">{description}</Text>}
          </Stack>
          {notice}
          {form}
          {footer && (
            <Text size="small" tone="muted" as="div">
              {footer}
            </Text>
          )}
        </Stack>
      </SeaGlass>
    </SeaGlassStage>
  );
}

export function AuthLayout({
  brand,
  aside,
  title,
  description,
  notice,
  form,
  footer,
  backdrop,
  seaGlass = false,
  className,
}: AuthLayoutProps) {
  if (seaGlass) {
    return (
      <SeaGlassAuth
        brand={brand}
        title={title}
        description={description}
        notice={notice}
        form={form}
        footer={footer}
        className={className}
      />
    );
  }
  return (
    <main
      id="main"
      tabIndex={-1}
      className={cn(
        'ui-auth relative isolate grid min-h-dvh grid-cols-1 bg-canvas text-fg focus:outline-none',
        'lg:grid-cols-2 glass:grid-cols-1 glass:place-items-center glass:p-4 sm:glass:p-6',
        'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] glass:pt-[max(1rem,env(safe-area-inset-top))] glass:pb-[max(1rem,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {backdrop && (
        <div aria-hidden="true" className="ui-auth-backdrop absolute inset-0 -z-10 overflow-hidden">
          {backdrop}
        </div>
      )}

      {/* enterprise only: from 1024px, the brand panel */}
      <div className="ui-auth-brand hidden flex-col justify-between gap-8 border-0 border-e border-solid border-border bg-sunken p-10 lg:flex glass:hidden!">
        <div>{brand}</div>
        <div>{aside}</div>
        <Text size="small" tone="subtle" as="small" className="block" aria-hidden="true">
          {' '}
        </Text>
      </div>

      <div
        className={cn(
          'ui-auth-panel flex min-w-0 flex-col justify-center p-6 sm:p-10',
          'glass:w-full glass:max-w-md glass:rounded-xl glass:border glass:border-solid glass:border-border glass:bg-surface glass-chrome glass:[box-shadow:var(--elev-3)]',
        )}
      >
        <Stack gap={6} className="mx-auto w-full max-w-sm">
          {/* the brand again, where the panel is not: a phone, and always in glass */}
          {brand && <div className="ui-auth-mark lg:hidden glass:block!">{brand}</div>}
          <Stack gap={2}>
            <Heading level={1} size={2}>
              {title}
            </Heading>
            {description && <Text tone="muted">{description}</Text>}
          </Stack>
          {notice}
          {form}
          {footer && (
            <Text size="small" tone="muted" as="div">
              {footer}
            </Text>
          )}
        </Stack>
      </div>
    </main>
  );
}
