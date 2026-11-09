import type { HTMLAttributes, ReactNode } from 'react';
import { type BreadcrumbItem, Breadcrumbs } from '../components/breadcrumbs';
import { Cluster } from '../components/layout/Cluster';
import { Stack } from '../components/layout/Stack';
import { Heading } from '../components/typography/Heading';
import { Eyebrow, Text } from '../components/typography/Text';
import { cn } from '../lib/cn';

/* PageHeader — the top of a page: breadcrumbs, then the heading block (eyebrow, the one <h1>,
   a muted description) with `actions` at its right, wrapping under it on a narrow screen,
   then an optional `toolbar` row (a range, a view switch). It renders a <header>.

   PageLayout is the header plus the body, spaced: what an app's own `Page` wraps (it adds only
   the document title). One h1 per page: this is it. */
export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  /** A small uppercase label above the title. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Buttons for the page as a whole: right of the heading, below it on a phone. */
  actions?: ReactNode;
  /** A trail above the title. The last item is the page itself. */
  breadcrumbs?: readonly BreadcrumbItem[];
  /** A row under the heading: filters, a range, a view switch. */
  toolbar?: ReactNode;
  /** Keep the <h1> for assistive tech only, when the body already shows the title (a status
      page's own message). The header's other parts are not rendered. */
  titleHidden?: boolean;
  /** Under 768px keep the <h1> for assistive tech only: a phone page whose body opens with its own
      big line (Home's "Good evening, Val") does not also show "Home" above it. From 768px the
      header is as usual. Anything else in the header (a description, actions) stays visible. */
  titleHiddenOnPhone?: boolean;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  breadcrumbs,
  toolbar,
  titleHidden,
  titleHiddenOnPhone,
  className,
  ...props
}: PageHeaderProps) {
  const onlyTitle = !eyebrow && !description && !actions && !toolbar && !breadcrumbs?.length;
  if (titleHidden) {
    return (
      <header {...props} className={cn('ui-page-header sr-only', className)}>
        <Heading level={1}>{title}</Heading>
      </header>
    );
  }
  return (
    <header
      {...props}
      className={cn(
        'ui-page-header',
        titleHiddenOnPhone && onlyTitle && 'max-md:sr-only',
        className,
      )}
    >
      <Stack gap={3}>
        {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
        <Cluster justify="between" align="end" gap={{ base: 3, md: 5 }}>
          <Stack gap={2} className="flex-[1_1_20rem]">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <Heading
              level={1}
              className={cn('[overflow-wrap:anywhere]', titleHiddenOnPhone && 'max-md:sr-only')}
            >
              {title}
            </Heading>
            {description && (
              <Text tone="muted" className="max-w-[62ch] text-pretty">
                {description}
              </Text>
            )}
          </Stack>
          {actions && <Cluster gap={2}>{actions}</Cluster>}
        </Cluster>
        {toolbar && <Cluster gap={3}>{toolbar}</Cluster>}
      </Stack>
    </header>
  );
}

export interface PageLayoutProps extends PageHeaderProps {
  children?: ReactNode;
}

/** PageHeader, then the page body, spaced. */
export function PageLayout({ children, className, ...header }: PageLayoutProps) {
  return (
    <Stack gap={5} className={cn('ui-page-layout', className)}>
      <PageHeader {...header} />
      <Stack gap={5}>{children}</Stack>
    </Stack>
  );
}
