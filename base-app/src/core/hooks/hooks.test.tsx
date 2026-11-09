import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { click } from '~/test/dom';
import { render } from '~/test/render';
import { useDebouncedValue } from './useDebouncedValue';
import { useLocalStorage } from './useLocalStorage';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function Probe({ value, ms = 300 }: { value: string; ms?: number }) {
    return <p data-testid="out">{useDebouncedValue(value, ms)}</p>;
  }
  const out = () => document.querySelector('[data-testid="out"]')?.textContent;
  const tick = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

  it('starts with the value itself', async () => {
    await render(<Probe value="a" />);
    expect(out()).toBe('a');
  });

  it('follows a change only after the quiet period', async () => {
    const r = await render(<Probe value="a" />);
    await r.rerender(<Probe value="b" />);
    await tick(299);
    expect(out()).toBe('a');
    await tick(1);
    expect(out()).toBe('b');
  });

  it('restarts the wait on every change, so only the last value lands', async () => {
    const r = await render(<Probe value="a" />);
    for (const v of ['b', 'c', 'd']) {
      await r.rerender(<Probe value={v} />);
      await tick(200);
    }
    expect(out()).toBe('a');
    await tick(100);
    expect(out()).toBe('d');
  });

  it('clears its timer on unmount', async () => {
    const r = await render(<Probe value="a" />);
    await r.rerender(<Probe value="b" />);
    await r.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useLocalStorage', () => {
  function Probe({ initial = false }: { initial?: boolean }) {
    const [on, setOn] = useLocalStorage('test-collapsed', initial);
    return (
      <>
        <p data-testid="out">{String(on)}</p>
        <button type="button" onClick={() => setOn((v) => !v)}>
          toggle
        </button>
      </>
    );
  }
  const out = () => document.querySelector('[data-testid="out"]')?.textContent;
  const button = () => document.querySelector('button') as HTMLButtonElement;

  it('uses the initial value when nothing is saved, and saves changes as JSON', async () => {
    await render(<Probe />);
    expect(out()).toBe('false');
    await click(button());
    expect(out()).toBe('true');
    expect(localStorage.getItem('test-collapsed')).toBe('true');
  });

  it('reads a saved value on mount', async () => {
    localStorage.setItem('test-collapsed', 'true');
    await render(<Probe />);
    expect(out()).toBe('true');
  });

  it('falls back to the initial value for text that is not JSON', async () => {
    localStorage.setItem('test-collapsed', '{nope');
    await render(<Probe initial />);
    expect(out()).toBe('true');
  });

  it('still works when storage throws on read and write', async () => {
    // only this hook's key is blocked: the render helper keeps its own skin and mode there
    const real = Storage.prototype.getItem;
    const realSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) {
      if (k === 'test-collapsed') throw new Error('blocked');
      return real.call(this, k);
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      k: string,
      v: string,
    ) {
      if (k === 'test-collapsed') throw new Error('blocked');
      realSet.call(this, k, v);
    });
    await render(<Probe />);
    expect(out()).toBe('false');
    await click(button());
    expect(out()).toBe('true');
  });

  it('follows another tab changing the key', async () => {
    await render(<Probe />);
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'test-collapsed', newValue: 'true' }),
      );
    });
    expect(out()).toBe('false'); // jsdom storage is unchanged, so the re-read gives the initial value
    localStorage.setItem('test-collapsed', 'true');
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'test-collapsed', newValue: 'true' }),
      );
    });
    expect(out()).toBe('true');
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'false' }));
    });
    expect(out()).toBe('true');
  });
});
