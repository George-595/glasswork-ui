import { PageLayout, type PageLayoutProps } from '@apps/ui';
import { useEffect } from 'react';
import { config } from '~/core/config';
import { useUnreadCount } from '~/core/notifications/unread-store';

/* Page — every page renders through this. It is the kit's PageLayout (breadcrumbs, eyebrow,
   the page's single <h1>, description, actions, toolbar, then the spaced body) plus the
   document title, so the outline and the tab title can't drift.

   The document title is set here, not in the shell: a page that renders through Page can be
   mounted on its own in a test and its title checked, and the sign-in and not-found pages
   (which have no shell) get theirs too. "<title> · <app name>", with "(3) " in front while
   notifications are unread (the count lives in core/notifications/unread-store.ts). */
export interface PageProps extends Omit<PageLayoutProps, 'title'> {
  title: string;
}

export function Page({ title, ...layout }: PageProps) {
  const unread = useUnreadCount();
  useEffect(() => {
    document.title = `${unread > 0 ? `(${unread > 99 ? '99+' : unread}) ` : ''}${title} · ${config.appName}`;
  }, [title, unread]);

  return <PageLayout title={title} {...layout} />;
}
