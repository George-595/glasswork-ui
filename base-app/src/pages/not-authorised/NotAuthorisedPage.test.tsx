import { afterEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { formatViolations, runAxe } from '~/test/axe';
import { click, getByRole } from '~/test/dom';
import { mockApi, VIEWER } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import NotAuthorisedPage from './NotAuthorisedPage';

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
});

async function mount(
  skin: 'enterprise' | 'glass' = 'enterprise',
  mode: 'light' | 'dark' = 'light',
) {
  const api = mockApi({ user: VIEWER });
  view = await render(
    <AuthProvider>
      <NotAuthorisedPage />
    </AuthProvider>,
    { skin, mode },
  );
  await flush();
  return api;
}

describe('NotAuthorisedPage', () => {
  it('explains the refusal and offers Go home and Sign in as someone else', async () => {
    await mount();
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(getByRole(document.body, 'heading', 'Not authorised').tagName).toBe('H1');
    expect(getByRole(document.body, 'heading', "You don't have access to this page")).toBeTruthy();
    expect(getByRole(document.body, 'link', 'Go home').getAttribute('href')).toBe('/');
    expect(getByRole(document.body, 'button', 'Sign in as someone else')).toBeTruthy();
  });

  it('Sign in as someone else signs the user out', async () => {
    const api = await mount();
    await click(getByRole(document.body, 'button', 'Sign in as someone else'));
    await flush();
    expect(api.calls).toContain('POST /api/auth/logout');
  });

  it('draws a shader accent in glass only', async () => {
    await mount('enterprise');
    expect(document.querySelector('.ui-shader-accent')).toBeNull();
    await view?.unmount();
    await mount('glass');
    expect(document.querySelector('.ui-shader-accent')).not.toBeNull();
  });
});

describe('a11y NotAuthorisedPage', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`a11y not-authorised · ${skin} · ${mode}`, async () => {
        await mount(skin, mode);
        const violations = await runAxe(document.body);
        expect(formatViolations(violations)).toBe('');
      });
    }
  }
});
