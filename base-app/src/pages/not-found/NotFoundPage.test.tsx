import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { formatViolations, runAxe } from '~/test/axe';
import { click, getByRole } from '~/test/dom';
import { mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import NotFoundPage from './NotFoundPage';

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
  vi.restoreAllMocks();
});

async function mount(
  skin: 'enterprise' | 'glass' = 'enterprise',
  mode: 'light' | 'dark' = 'light',
) {
  mockApi();
  view = await render(
    <AuthProvider>
      <NotFoundPage />
    </AuthProvider>,
    { skin, mode },
  );
  await flush();
  return view;
}

describe('NotFoundPage', () => {
  it('has one h1, an empty state with clear copy, and two ways out', async () => {
    await mount();
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(getByRole(document.body, 'heading', 'Page not found').tagName).toBe('H1');
    expect(getByRole(document.body, 'heading', "We can't find that page").tagName).toBe('H2');

    const home = getByRole(document.body, 'link', 'Go home');
    expect(home.getAttribute('href')).toBe('/');
    expect(getByRole(document.body, 'button', 'Go back')).toBeTruthy();
  });

  it('Go back steps back in the history', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    await mount();
    await click(getByRole(document.body, 'button', 'Go back'));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('draws a shader accent in glass only', async () => {
    await mount('enterprise');
    expect(document.querySelector('.ui-shader-accent')).toBeNull();
    await view?.unmount();
    await mount('glass');
    expect(document.querySelector('.ui-shader-accent')).not.toBeNull();
  });
});

describe('a11y NotFoundPage', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`a11y not-found · ${skin} · ${mode}`, async () => {
        await mount(skin, mode);
        const violations = await runAxe(document.body);
        expect(formatViolations(violations)).toBe('');
      });
    }
  }
});
