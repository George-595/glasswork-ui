import { describe, expect, it, vi } from 'vitest';
import { formatViolations, runAxe } from '~/test/axe';
import { getAllByRole, getByText } from '~/test/dom';
import { flush, render } from '~/test/render';
import { ApiStatusBadge, Delta, Money, Page } from './index';

describe('Page', () => {
  it('sets the document title and renders exactly one h1', async () => {
    await render(<Page title="Overview" eyebrow="Dashboard" description="Hello" />);
    expect(document.title).toMatch(/^Overview · /);
    expect(getAllByRole(document.body, 'heading').filter((h) => h.tagName === 'H1')).toHaveLength(
      1,
    );
  });
});

describe('Money and Delta', () => {
  it('formats pence and shows the sign when toned', async () => {
    await render(
      <p>
        <Money minor={123456} /> <Money minor={-500} tone />
      </p>,
    );
    expect(getByText(document.body, '£1,234.56')).toBeTruthy();
    expect(document.body.textContent).toContain('−£5.00');
  });

  it('Delta tells direction in words, not only colour', async () => {
    await render(<Delta ratio={0.042} />);
    expect(document.body.textContent).toContain('up');
    expect(document.body.textContent).toContain('+4.2%');
  });
});

describe('ApiStatusBadge', () => {
  it('shows offline when fetch rejects', async () => {
    await render(<ApiStatusBadge />);
    await flush();
    expect(document.body.textContent).toContain('API offline');
  });

  it('shows online when health answers 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ ok: true, service: 'base-app-api', uptimeSec: 1, time: 'now' }),
      ),
    );
    await render(<ApiStatusBadge />);
    await flush();
    expect(document.body.textContent).toContain('API online');
  });
});

describe('a11y core/ui', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        await render(
          <main>
            <Page title="Overview" eyebrow="Dashboard" description="Fake data">
              <Money minor={100} tone /> <Delta ratio={-0.1} /> <ApiStatusBadge />
            </Page>
          </main>,
          { skin, mode },
        );
        await flush();
        expect(formatViolations(await runAxe())).toBe('');
      });
    }
  }
});
