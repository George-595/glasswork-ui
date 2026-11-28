// @vitest-environment jsdom
/* CellGrid (src/display/CellGrid.tsx): the ARIA grid, the one tab stop, the keys, the names, the
   read-only and disabled states, the touch width, and an axe pass in every skin x mode. */
import axe from 'axe-core';
import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CellGrid, type CellGridProps, cellIndex } from '../src/display';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-skin');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const render = (ui: ReactNode) => act(() => root.render(ui));
const cells = () => Array.from(host.querySelectorAll<HTMLElement>('[role="gridcell"]'));
const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  });

function Harness(
  props: Partial<CellGridProps> & { start?: number[]; spy?: (v: ReadonlySet<number>) => void },
) {
  const { start = [], spy, ...rest } = props;
  const [value, setValue] = useState<ReadonlySet<number>>(new Set(start));
  return (
    <CellGrid
      label="Watched areas"
      src="data:image/gif;base64,R0lGODlhAQABAAAAACw="
      alt="A still"
      value={value}
      onChange={(v) => {
        spy?.(v);
        setValue(v);
      }}
      {...rest}
    />
  );
}

describe('CellGrid', () => {
  it('is a named grid of 8 rows by 12 columns of cells by default', () => {
    render(<Harness />);
    const grid = host.querySelector('[role="grid"]');
    expect(grid?.getAttribute('aria-label')).toBe('Watched areas');
    expect(host.querySelectorAll('[role="row"]')).toHaveLength(8);
    expect(cells()).toHaveLength(96);
  });

  it('honours other sizes', () => {
    render(<Harness columns={4} rows={3} />);
    expect(host.querySelectorAll('[role="row"]')).toHaveLength(3);
    expect(cells()).toHaveLength(12);
    expect(cellIndex(2, 3, 4)).toBe(11);
  });

  it('names each cell by row, column, zone and state', () => {
    render(
      <Harness
        start={[13]}
        cellName={({ row, column }) => (row === 1 && column < 3 ? 'Door' : undefined)}
      />,
    );
    expect(cells()[0]?.getAttribute('aria-label')).toBe('Row 1, column 1, off');
    expect(cells()[13]?.getAttribute('aria-label')).toBe('Row 2, column 2, Door, on');
    expect(cells()[13]?.getAttribute('aria-selected')).toBe('true');
    expect(cells()[14]?.getAttribute('aria-selected')).toBe('false');
  });

  it('has exactly one tab stop', () => {
    render(<Harness />);
    expect(cells().filter((c) => c.tabIndex === 0)).toHaveLength(1);
    expect(cells()[0]?.tabIndex).toBe(0);
  });

  it('moves with the arrow keys, keeping one tab stop, and stops at the edges', () => {
    render(<Harness />);
    const first = cells()[0] as HTMLElement;
    act(() => first.focus());
    key(first, 'ArrowRight');
    expect(document.activeElement).toBe(cells()[1]);
    expect(cells().filter((c) => c.tabIndex === 0)).toEqual([cells()[1]]);
    key(document.activeElement as Element, 'ArrowDown');
    expect(document.activeElement).toBe(cells()[13]);
    key(document.activeElement as Element, 'ArrowLeft');
    key(document.activeElement as Element, 'ArrowLeft');
    expect(document.activeElement).toBe(cells()[12]);
    key(document.activeElement as Element, 'ArrowUp');
    key(document.activeElement as Element, 'ArrowUp');
    expect(document.activeElement).toBe(cells()[0]);
  });

  it('Home and End go to the ends of the row; with Ctrl, of the grid', () => {
    render(<Harness />);
    const c = cells();
    act(() => c[14]?.focus());
    key(c[14] as Element, 'End');
    expect(document.activeElement).toBe(c[23]);
    key(c[23] as Element, 'Home');
    expect(document.activeElement).toBe(c[12]);
    key(c[12] as Element, 'End', { ctrlKey: true });
    expect(document.activeElement).toBe(c[95]);
    key(c[95] as Element, 'Home', { ctrlKey: true });
    expect(document.activeElement).toBe(c[0]);
  });

  it('Space and Enter toggle the focused cell; a click toggles too', () => {
    const spy = vi.fn<(v: ReadonlySet<number>) => void>();
    render(<Harness spy={spy} />);
    const c = cells();
    act(() => c[5]?.focus());
    key(c[5] as Element, ' ');
    expect(Array.from(spy.mock.calls[0]?.[0] as Set<number>)).toEqual([5]);
    expect(cells()[5]?.getAttribute('aria-selected')).toBe('true');
    key(cells()[5] as Element, 'Enter');
    expect(cells()[5]?.getAttribute('aria-selected')).toBe('false');
    act(() => cells()[7]?.click());
    expect(cells()[7]?.getAttribute('aria-selected')).toBe('true');
    expect(cells()[7]?.tabIndex).toBe(0);
  });

  it('never changes the set it was given', () => {
    const given = new Set([1]);
    const spy = vi.fn<(v: ReadonlySet<number>) => void>();
    render(<CellGrid label="Zones" value={given} onChange={spy} />);
    act(() => cells()[2]?.click());
    expect(Array.from(given)).toEqual([1]);
    expect(spy.mock.calls[0]?.[0]).not.toBe(given);
    expect(Array.from(spy.mock.calls[0]?.[0] as Set<number>).toSorted()).toEqual([1, 2]);
  });

  it('read-only and disabled show the cells but do not toggle; focus still moves', () => {
    for (const mode of ['readOnly', 'disabled'] as const) {
      const spy = vi.fn<(v: ReadonlySet<number>) => void>();
      render(<Harness {...{ [mode]: true }} start={[0]} spy={spy} />);
      const c = cells();
      act(() => c[0]?.click());
      key(c[0] as Element, ' ');
      expect(spy).not.toHaveBeenCalled();
      expect(c[0]?.getAttribute('aria-selected')).toBe('true');
      act(() => c[0]?.focus());
      key(c[0] as Element, 'ArrowRight');
      expect(document.activeElement).toBe(cells()[1]);
      const grid = host.querySelector('[role="grid"]');
      expect(grid?.getAttribute(mode === 'readOnly' ? 'aria-readonly' : 'aria-disabled')).toBe(
        'true',
      );
    }
  });

  it('draws a tick on every cell that is on, so state is not colour alone', () => {
    render(<Harness start={[3, 4]} />);
    expect(host.querySelectorAll('[data-on] svg')).toHaveLength(2);
  });

  it('asks for 48px cells on a touch screen', () => {
    render(<Harness />);
    const box = host.querySelector('.ui-cell-grid > div') as HTMLElement;
    expect(box.className).toContain('pointer-coarse:min-w-(--cell-grid-min)');
    // 8 rows of 48px at 16:9 are wider than 12 columns of 48px
    expect(box.style.getPropertyValue('--cell-grid-min')).toBe(`${Math.ceil(8 * 48 * (16 / 9))}px`);
  });

  it('draws children in place of an image', () => {
    render(
      <CellGrid label="Zones" value={new Set()} onChange={() => {}}>
        <canvas data-testid="v" />
      </CellGrid>,
    );
    expect(host.querySelector('canvas')).not.toBeNull();
    expect(host.querySelector('img')).toBeNull();
  });
});

const AXE = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  rules: { 'color-contrast': { enabled: false } },
  resultTypes: ['violations'],
} as Parameters<typeof axe.run>[1];

describe('axe: CellGrid, every skin x mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      for (const state of ['normal', 'readOnly', 'disabled'] as const) {
        it(`${skin} · ${mode} · ${state}`, async () => {
          document.documentElement.setAttribute('data-skin', skin);
          document.documentElement.setAttribute('data-theme', mode);
          render(
            <main>
              <Harness
                start={[0, 13, 40]}
                readOnly={state === 'readOnly'}
                disabled={state === 'disabled'}
              />
            </main>,
          );
          const r = await axe.run(document.body, AXE);
          expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
        });
      }
    }
  }
});
