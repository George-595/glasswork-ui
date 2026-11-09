import { Suspense } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { lazyResolved } from './lazyResolved';

const Page = ({ name }: { name: string }) => <p>Page {name}</p>;
const markup = (C: () => React.ReactElement) =>
  renderToString(
    <Suspense fallback={<i>loading</i>}>
      <C />
    </Suspense>,
  );

describe('lazyResolved', () => {
  it('draws the component in place once its file has loaded, with no Suspense fallback', async () => {
    const load = vi.fn<() => Promise<{ default: typeof Page }>>(async () => ({ default: Page }));
    const { Component, load: preload } = lazyResolved(load);
    await preload();
    const html = markup(() => <Component name="a" />);
    expect(html).toContain('Page <!-- -->a');
    expect(html).not.toContain('loading');
    expect(html).not.toContain('<!--$?-->');
    await preload();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('falls back to React.lazy behind the caller’s Suspense when it has not loaded', () => {
    const { Component } = lazyResolved(async () => ({ default: Page }));
    const html = markup(() => <Component name="a" />);
    expect(html).toContain('loading');
  });

  it('a failed load can be tried again', async () => {
    let fail = true;
    const { load } = lazyResolved(async () => {
      if (fail) throw new Error('offline');
      return { default: Page };
    });
    await expect(load()).rejects.toThrow('offline');
    fail = false;
    await expect(load()).resolves.toBeUndefined();
  });
});
