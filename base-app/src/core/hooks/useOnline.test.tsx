import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '~/test/render';
import { useOnline } from './useOnline';

function Probe() {
  return <p data-testid="out">{useOnline() ? 'online' : 'offline'}</p>;
}
const out = () => document.querySelector('[data-testid="out"]')?.textContent;

describe('useOnline', () => {
  it('follows the online and offline events', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get');
    onLine.mockReturnValue(true);
    await render(<Probe />);
    expect(out()).toBe('online');
    await act(async () => {
      onLine.mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(out()).toBe('offline');
    await act(async () => {
      onLine.mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(out()).toBe('online');
  });
});
