import { isPlainLeftClick } from './Link';
import { isAppHref, navigate } from './path';

/* The page of this app a click on an anchor leads to ('/table?page=2'), or null when the click
   should keep the browser's own behaviour (a modified click, another site, a file, `target`,
   `download`, an in-page '#main'). */
export function appTargetOfClick(event: MouseEvent): string | null {
  if (!isPlainLeftClick(event)) return null;
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target && anchor.target !== '_self') return null;
  if (anchor.hasAttribute('download')) return null;
  const href = anchor.getAttribute('href') ?? '';
  if (!isAppHref(href)) return null;
  return href;
}

/* The kit's navigation (sidebar, menus, tab bars, breadcrumbs) renders plain anchors with real
   hrefs. One listener turns a plain left click on any of them into a move within the app, so no
   screen has to wrap its links. A <Link> handles its own click first (and calls
   preventDefault), so it is not handled twice. Returns the remover. */
export function installLinkInterception(doc: Document = document): () => void {
  const onClick = (event: MouseEvent) => {
    const target = appTargetOfClick(event);
    if (target === null) return;
    event.preventDefault();
    navigate(target);
  };
  doc.addEventListener('click', onClick);
  return () => doc.removeEventListener('click', onClick);
}
