// @vitest-environment jsdom
/* TreeView: folders closed unless asked, and `expanded` controls them from outside. */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type TreeNode, TreeView } from '../src';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS: readonly TreeNode[] = [
  { id: 'all', label: 'All' },
  { id: 'g-a', label: 'Group A', children: [{ id: 'a1', label: 'A one' }] },
  { id: 'g-b', label: 'Group B', children: [{ id: 'b1', label: 'B one' }] },
];

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

const open = (label: string) =>
  [...host.querySelectorAll('[role="treeitem"]')]
    .find((el) => el.getAttribute('aria-label') === label || el.textContent?.startsWith(label))
    ?.getAttribute('aria-expanded');

describe('TreeView', () => {
  it('starts with every folder closed when nothing is expanded', () => {
    act(() => root.render(<TreeView label="Types" items={ITEMS} />));
    expect(open('Group A')).toBe('false');
    expect(open('Group B')).toBe('false');
  });

  it('opens and closes folders from outside with `expanded`', () => {
    let setOpen: (ids: string[]) => void = () => {};
    function Harness() {
      const [ids, set] = useState<string[]>([]);
      setOpen = set;
      return <TreeView label="Types" items={ITEMS} expanded={ids} onExpandedChange={set} />;
    }
    act(() => root.render(<Harness />));
    expect(open('Group B')).toBe('false');
    act(() => setOpen(['g-b']));
    expect(open('Group B')).toBe('true');
    expect(open('Group A')).toBe('false');
    act(() => setOpen([]));
    expect(open('Group B')).toBe('false');
  });
});
