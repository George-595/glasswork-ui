// @vitest-environment jsdom
/* AgentCopilot's typed box: shown only with `onPrompt`, and a request it cannot turn into steps
   says so and changes nothing. */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentCopilot } from '../src';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const type = (input: HTMLInputElement, value: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('AgentCopilot typed box', () => {
  it('has no box without onPrompt', () => {
    act(() => root.render(<AgentCopilot plans={[]} />));
    expect(host.querySelector('input')).toBeNull();
  });

  it('asks onPrompt and says when it could not work the words out', async () => {
    const onPrompt = vi.fn<(text: string) => null>(() => null);
    act(() => root.render(<AgentCopilot plans={[]} onPrompt={onPrompt} />));
    const input = host.querySelector('input') as HTMLInputElement;
    act(() => type(input, 'something odd'));
    await act(async () => {
      host.querySelector('form')?.requestSubmit();
    });
    expect(onPrompt).toHaveBeenCalledWith('something odd');
    expect(host.textContent).toContain('I couldn\'t work out "something odd"');
    expect(host.textContent).toContain('Nothing changed');
  });
});
