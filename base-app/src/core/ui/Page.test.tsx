/* Page: the header's slots (eyebrow, description, actions, breadcrumbs, toolbar), the single h1 and
   the document title. Axe in every skin and mode with every slot filled. */
import { describe, expect, it } from 'vitest';
import { config } from '~/core/config';
import { formatViolations, runAxe } from '~/test/axe';
import { getAllByRole, getByRole } from '~/test/dom';
import { render } from '~/test/render';
import { Button, Page } from './index';

const CRUMBS = [{ label: 'Admin', href: '/admin' }, { label: 'Users' }] as const;

function full() {
  return (
    <main>
      <Page
        title="Users"
        eyebrow="Admin"
        description="Everyone who can sign in."
        breadcrumbs={CRUMBS}
        actions={<Button>Invite</Button>}
        toolbar={<input aria-label="Filter users" />}
      >
        <p>Body</p>
      </Page>
    </main>
  );
}

describe('Page header', () => {
  it('renders eyebrow, one h1, description, actions and toolbar in order', async () => {
    await render(full());
    const header = document.querySelector('header') as HTMLElement;
    const text = header.textContent ?? '';
    // breadcrumbs, then eyebrow, title, description, actions, then the toolbar
    const order = ['Admin', 'Users', 'Everyone who can sign in.', 'Invite'].map((t) =>
      text.indexOf(t),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual(order.toSorted((x, y) => x - y));
    expect(getAllByRole(document.body, 'heading').filter((h) => h.tagName === 'H1')).toHaveLength(
      1,
    );
    expect(getByRole(header, 'button', 'Invite')).toBeTruthy();
    expect(header.querySelector('input[aria-label="Filter users"]')).not.toBeNull();
    const toolbar = header.querySelector('input') as HTMLElement;
    const actions = getByRole(header, 'button', 'Invite');
    expect(
      actions.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('puts the breadcrumb trail above the title, the last item being the page', async () => {
    await render(full());
    const nav = getByRole(document.body, 'navigation', 'Breadcrumb');
    expect(nav.querySelector('a')?.getAttribute('href')).toBe('/admin');
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe('Users');
    const h1 = document.querySelector('h1') as HTMLElement;
    expect(nav.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders nothing for the slots it is not given', async () => {
    await render(<Page title="Plain" />);
    const header = document.querySelector('header') as HTMLElement;
    expect(header.textContent).toBe('Plain');
    expect(header.querySelector('button')).toBeNull();
    expect(header.querySelector('input')).toBeNull();
    expect(document.querySelector('nav')).toBeNull();
  });

  it('sets the document title to "<title> · <app name>" and follows a change of title', async () => {
    const view = await render(<Page title="First" />);
    expect(document.title).toBe(`First · ${config.appName}`);
    await view.rerender(<Page title="Second" />);
    expect(document.title).toBe(`Second · ${config.appName}`);
  });
});

describe('a11y Page header', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        await render(full(), { skin, mode });
        expect(formatViolations(await runAxe(document.body))).toBe('');
      });
    }
  }
});
