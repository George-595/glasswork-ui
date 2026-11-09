import type { ReactNode } from 'react';
import { EmptyState } from '../components/empty-state';
import { Stack } from '../components/layout/Stack';
import { Eyebrow } from '../components/typography/Text';
import type { IconName } from '../icons/Icon';
import { cn } from '../lib/cn';

/* StatusPage — a whole-page message for a dead end: 404 not found, 403 not allowed, 500 broke.
   A centred EmptyState with the status code above it, one primary way out and, usually, a
   secondary one (go back). Put it inside the app's Page, which supplies the <h1>; the title
   here is an h2 by default (`headingLevel`), as in an EmptyState.

     <StatusPage code="404" icon="search" title="We can't find that page"
       description="The address may be mistyped, or the page has moved."
       primaryAction={<Link …>Go home</Link>} secondaryAction={<Button>Go back</Button>} />

   `backdrop` is decorative (a ShaderAccent) and is hidden from assistive tech. */
export interface StatusPageProps {
  /** "404", "403", "500". Shown small above the title; read as part of the page. */
  code?: string;
  icon?: IconName | ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** The way out: a Link or Button at the primary level. */
  primaryAction?: ReactNode;
  /** A second way: Go back, Contact support. */
  secondaryAction?: ReactNode;
  headingLevel?: 2 | 3;
  backdrop?: ReactNode;
  className?: string;
}

export function StatusPage({
  code,
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  headingLevel = 2,
  backdrop,
  className,
}: StatusPageProps) {
  const action =
    primaryAction || secondaryAction ? (
      <>
        {primaryAction}
        {secondaryAction}
      </>
    ) : undefined;
  return (
    <div
      className={cn(
        'ui-status-page relative isolate flex min-h-[60dvh] items-center justify-center overflow-hidden py-10',
        className,
      )}
    >
      {backdrop && (
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          {backdrop}
        </div>
      )}
      <Stack gap={3} align="center" className="w-full max-w-md">
        {code && <Eyebrow>Error {code}</Eyebrow>}
        <EmptyState
          as={`h${headingLevel}`}
          icon={icon}
          title={title}
          description={description}
          action={action}
          className="w-full border-transparent"
        />
      </Stack>
    </div>
  );
}
