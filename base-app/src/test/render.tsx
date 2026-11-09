/* render — mount a React tree into jsdom with a chosen skin and mode, inside
   act(), with no testing-library. useTheme() reads its starting values from
   localStorage, so that is where the skin and mode are set. */
import type { ReactElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '~/core/ui';

export type TestSkin = 'enterprise' | 'glass';
export type TestMode = 'light' | 'dark';

export interface RenderOptions {
  skin?: TestSkin;
  mode?: TestMode;
}

export interface Rendered {
  container: HTMLElement;
  rerender(ui: ReactElement): Promise<void>;
  unmount(): Promise<void>;
}

export async function render(ui: ReactElement, opts: RenderOptions = {}): Promise<Rendered> {
  const skin = opts.skin ?? 'enterprise';
  const mode = opts.mode ?? 'light';
  localStorage.setItem('ui-skin', skin);
  localStorage.setItem('ui-theme', mode);
  document.documentElement.setAttribute('data-skin', skin);
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.setAttribute('lang', 'en-GB');
  document.title = 'Test';

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ThemeProvider>{ui}</ThemeProvider>);
  });
  return {
    container,
    async rerender(next) {
      await act(async () => {
        root.render(<ThemeProvider>{next}</ThemeProvider>);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** Let lazy pages, effects and resolved fetch promises settle. */
export async function flush(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
