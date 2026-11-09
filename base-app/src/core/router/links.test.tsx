import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installLinkInterception } from './links';

let remove: () => void;
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  remove = installLinkInterception();
});
afterEach(() => {
  remove();
  vi.restoreAllMocks();
});

function anchor(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  for (const [name, value] of Object.entries(attrs)) a.setAttribute(name, value);
  a.textContent = 'link';
  document.body.append(a);
  return a;
}

async function click(el: Element, init: MouseEventInit = {}): Promise<MouseEvent> {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  await act(async () => {
    el.dispatchEvent(event);
  });
  return event;
}

describe('installLinkInterception', () => {
  it('turns a plain click on a link to a page into a move within the app', async () => {
    const event = await click(anchor('/table?page=2'));
    expect(event.defaultPrevented).toBe(true);
    expect(`${window.location.pathname}${window.location.search}`).toBe('/table?page=2');
  });

  it('finds the anchor from a click on something inside it', async () => {
    const a = anchor('/graphs');
    const inner = document.createElement('span');
    a.append(inner);
    await click(inner);
    expect(window.location.pathname).toBe('/graphs');
  });

  it.each([
    ['a new-tab click', '/table', {}, { ctrlKey: true }],
    ['a middle click', '/table', {}, { button: 1 }],
    ['a link with a target', '/table', { target: '_blank' }, {}],
    ['a download', '/files/a.csv', { download: '' }, {}],
    ['a file from the API', '/api/files/1', {}, {}],
    ['another site', 'https://example.test/x', {}, {}],
    ['a skip link', '#main', {}, {}],
  ])('leaves %s to the browser', async (_name, href, attrs, init) => {
    const a = anchor(href, attrs);
    // jsdom cannot navigate: swallow the default action but keep what the listener decided
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('click', stop);
    await act(async () => {
      a.dispatchEvent(event);
    });
    document.removeEventListener('click', stop);
    expect(window.location.pathname).toBe('/');
  });

  it('is removable', async () => {
    remove();
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('click', stop);
    await click(anchor('/table'));
    document.removeEventListener('click', stop);
    expect(window.location.pathname).toBe('/');
    remove = installLinkInterception();
  });
});
