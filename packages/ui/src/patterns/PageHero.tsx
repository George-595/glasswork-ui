import type { HTMLAttributes, ReactNode } from 'react';
import { Cluster } from '../components/layout/Cluster';
import { Stack } from '../components/layout/Stack';
import { Text } from '../components/typography/Text';
import { ShaderAccent } from '../effects/shaders/ShaderAccent';
import { cn } from '../lib/cn';
import { useDocumentSkin } from '../theme/useDocumentSkin';

/* PageHero — the strip under a page header that greets the reader: a headline, a line under it
   and `actions` (a range control) at the right, wrapping under on a phone. In the glass skin a
   quiet ShaderAccent glows behind it; enterprise draws nothing extra. The headline is a
   paragraph, not a heading: the page's one <h1> is the PageHeader's. */
export interface PageHeroProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  /** The line under the headline: a date, a status. */
  subtitle?: ReactNode;
  /** Controls at the right: a SegmentedControl, buttons. */
  actions?: ReactNode;
}

export function PageHero({ title, subtitle, actions, className, ...props }: PageHeroProps) {
  const skin = useDocumentSkin();
  return (
    <div {...props} className={cn('ui-page-hero ui-shader-host py-3', className)}>
      {skin === 'glass' && <ShaderAccent preset="aurora-noise" intensity={0.4} />}
      <Cluster justify="between" gap={{ base: 3, md: 4 }}>
        <Stack gap={1}>
          <Text className="[font:var(--t-h3)]">{title}</Text>
          {subtitle && (
            <Text size="small" tone="muted">
              {subtitle}
            </Text>
          )}
        </Stack>
        {actions}
      </Cluster>
    </div>
  );
}
