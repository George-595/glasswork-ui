import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link } from './Link';
import { LocationProvider, usePath, useSearch } from './location';

declare global {
  // React's act() needs this flag outside a test framework integration.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function Probe() {
  return (
    <span>
      {usePath()}|{useSearch()}
    </span>
  );
}

describe('Link, usePath and useSearch', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState(null, '', '/');
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  const click = (el: Element, init: MouseEventInit = {}) =>
    act(async () => {
      el.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }),
      );
    });

  it('renders a real anchor whose href is the path', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Link to="/table" className="nav">
          Table
        </Link>,
      );
    });
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('/table');
    expect(a?.className).toBe('nav');
    expect(a?.textContent).toBe('Table');
    await act(async () => root.unmount());
  });

  it('a plain click moves within the app and re-renders; a modified click is left to the browser', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <>
          <Link to="/admin/users/?q=a">Users</Link>
          <Probe />
        </>,
      );
    });
    const a = container.querySelector('a') as HTMLAnchorElement;
    expect(container.querySelector('span')?.textContent).toBe('/|');

    const pushed = vi.spyOn(window.history, 'pushState');
    await click(a, { ctrlKey: true });
    await click(a, { button: 1 });
    expect(pushed).not.toHaveBeenCalled();

    await click(a);
    expect(pushed).toHaveBeenCalledTimes(1);
    expect(container.querySelector('span')?.textContent).toBe('/admin/users|?q=a');
    await act(async () => root.unmount());
  });

  it('follows Back and Forward (popstate)', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Probe />);
    });
    await act(async () => {
      window.history.replaceState(null, '', '/graphs?range=7');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(container.textContent).toBe('/graphs|?range=7');
    await act(async () => root.unmount());
  });

  it('on a server (no window to read) it answers with the request address', async () => {
    const { renderToString } = await import('react-dom/server');
    const html = renderToString(
      <LocationProvider url="/table/?page=2#x">
        <Probe />
      </LocationProvider>,
    );
    expect(html.replaceAll('<!-- -->', '')).toBe('<span>/table|?page=2</span>');
  });
});
