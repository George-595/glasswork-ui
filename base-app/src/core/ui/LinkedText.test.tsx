import { afterEach, describe, expect, it } from 'vitest';
import { formatViolations, runAxe } from '~/test/axe';
import { type Rendered, render } from '~/test/render';
import { LinkedText, splitLinks } from './LinkedText';

describe('splitLinks', () => {
  it('finds http and https addresses and leaves the rest', () => {
    expect(splitLinks('Open https://a.example.com/x?y=1#/z now.')).toEqual([
      { text: 'Open ' },
      { text: 'https://a.example.com/x?y=1#/z', url: 'https://a.example.com/x?y=1#/z' },
      { text: ' now.' },
    ]);
  });

  it('keeps trailing punctuation out of the address', () => {
    expect(splitLinks('(see http://x.test/a), or http://y.test.')).toEqual([
      { text: '(see ' },
      { text: 'http://x.test/a', url: 'http://x.test/a' },
      { text: '), or ' },
      { text: 'http://y.test', url: 'http://y.test' },
      { text: '.' },
    ]);
  });

  it('is plain text when there is no address, and ignores other schemes', () => {
    expect(splitLinks('nothing here')).toEqual([{ text: 'nothing here' }]);
    expect(splitLinks('javascript:alert(1) ftp://x.test')).toEqual([
      { text: 'javascript:alert(1) ftp://x.test' },
    ]);
    expect(splitLinks('')).toEqual([]);
  });
});

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
});

describe('LinkedText', () => {
  it('renders links that open safely in a new tab, and never reads text as HTML', async () => {
    view = await render(
      <LinkedText
        label="Message"
        text={'Hello <b>bold</b>\nReset: https://app.example.com/#/reset?token=abc'}
      />,
    );
    const a = view.container.querySelector('a') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('https://app.example.com/#/reset?token=abc');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(view.container.querySelector('b')).toBeNull();
    expect(view.container.textContent).toContain('Hello <b>bold</b>');
    expect(view.container.querySelectorAll('a')).toHaveLength(1);
  });

  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`a11y · ${skin} · ${mode}`, async () => {
        view = await render(
          <main>
            <LinkedText label="Message" text="Open https://app.example.com/x to continue." />
          </main>,
          { skin, mode },
        );
        expect(formatViolations(await runAxe())).toBe('');
      });
    }
  }
});
