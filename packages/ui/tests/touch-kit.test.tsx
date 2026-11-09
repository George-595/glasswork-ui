// @vitest-environment jsdom
/* Integration round 1 kit additions: touch-sized fields (48px under pointer: coarse), the
   interactive Card, the sticky and stretched Sheet footer, the sticky BulkActionBar, RadioCards
   on two phone columns, ToggleGroup wrapping, the quiet KpiRow error and the 48px icon-only
   Menu. Classes are the contract here: jsdom has no pointer media query. */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Legend } from '../src/charts/ChartFrame';
import {
  BulkActionBar,
  Button,
  Card,
  CommandPaletteButton,
  Dialog,
  Input,
  KpiRow,
  KpiTile,
  Menu,
  NativeSelect,
  NumberField,
  PasswordInput,
  Photo,
  PhotoCapture,
  RadioCards,
  SaveBar,
  SegmentedControl,
  Sheet,
  Switch,
  Textarea,
  Toggle,
  ToggleGroup,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  // jsdom has no modal <dialog>
  const dlg = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;
  dlg.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  dlg.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (node: ReactNode) => act(() => root.render(node));
const $ = <E extends Element = HTMLElement>(sel: string, within: ParentNode = document) =>
  within.querySelector(sel) as E;

describe('fields grow to a thumb target on a touch screen', () => {
  it('Input, Textarea, NativeSelect and the password field are 48px with 16px text', () => {
    render(
      <>
        <Input aria-label="a" />
        <Textarea aria-label="b" />
        <NativeSelect aria-label="c">
          <option>x</option>
        </NativeSelect>
        <PasswordInput aria-label="d" />
      </>,
    );
    for (const el of [
      $('input[aria-label="a"]'),
      $('textarea'),
      $('select'),
      $('input[aria-label="d"]'),
    ]) {
      expect(el.className).toContain('pointer-coarse:min-h-12');
      expect(el.className).toContain('pointer-coarse:text-[16px]');
    }
  });

  it('NumberField grows its box, its text and its steppers', () => {
    render(<NumberField aria-label="n" value={1} onValueChange={() => {}} />);
    expect($('.ui-number-field').className).toContain('pointer-coarse:min-h-12');
    expect($('[role="spinbutton"]').className).toContain('pointer-coarse:text-[16px]');
    expect($('button[aria-label="Increase"]').className).toContain('pointer-coarse:size-12');
  });

  it('Toggle sizes grow to 48px', () => {
    render(
      <>
        <Toggle size="sm">a</Toggle>
        <Toggle>b</Toggle>
        <Toggle size="lg">c</Toggle>
        <Toggle size="icon" aria-label="d" />
      </>,
    );
    const [sm, md, lg, icon] = Array.from(document.querySelectorAll('button'));
    expect(sm?.className).toContain('pointer-coarse:min-h-12');
    expect(md?.className).toContain('pointer-coarse:min-h-12');
    expect(lg?.className).toContain('pointer-coarse:min-h-12');
    expect(icon?.className).toContain('pointer-coarse:size-12');
  });

  it('an icon-only Menu trigger is 24px with a mouse and 48px on a touch screen', () => {
    render(<Menu label="More" icon="chevron-down" iconOnly items={[{ id: 'a', label: 'A' }]} />);
    const trigger = $('button[aria-label="More"], button');
    expect(trigger.className).toContain('size-6');
    expect(trigger.className).toContain('pointer-coarse:size-12');
  });

  it("a Menu trigger's icon is 15px by default and takes iconSize (18 matches the top bar's icons)", () => {
    render(<Menu label="More" icon="user" iconOnly items={[{ id: 'a', label: 'A' }]} />);
    expect($('button svg')?.getAttribute('width')).toBe('15');
    render(
      <Menu label="More" icon="user" iconOnly iconSize={18} items={[{ id: 'a', label: 'A' }]} />,
    );
    expect($('button svg')?.getAttribute('width')).toBe('18');
  });
});

/* Every control is a 48px target on a touch screen; the 24px minimum (WCAG
   2.5.8) is only the floor. These pin the pointer-coarse classes each control owns. */
describe('every control is at least 48px on a touch screen', () => {
  it('Button: sm, md, lg and icon are 48px; xl is 56; a link is 44 (inline, never a block of text)', () => {
    render(
      <>
        <Button size="sm">sm</Button>
        <Button size="icon" aria-label="i" />
        <Button variant="link" size="sm">
          link
        </Button>
        <Button variant="link" size="md">
          link md
        </Button>
        <Button size="xl">xl</Button>
      </>,
    );
    const [sm, icon, link, linkMd, xl] = Array.from(document.querySelectorAll('button'));
    expect(sm?.className).toContain('pointer-coarse:min-h-12');
    expect(sm?.className).toContain('pointer-coarse:min-w-12');
    expect(icon?.className).toContain('pointer-coarse:size-12');
    for (const l of [link, linkMd]) {
      expect(l?.className).toContain('pointer-coarse:min-h-11');
      expect(l?.className).not.toContain('pointer-coarse:min-h-12');
    }
    expect(xl?.className).toContain('min-h-14');
  });

  it('the Sheet and Dialog close buttons are icon buttons (48 on touch, 36 with a mouse)', () => {
    render(
      <>
        <Sheet open onOpenChange={() => {}} title="S" description="d">
          x
        </Sheet>
        <Dialog open onClose={() => {}} title="D">
          x
        </Dialog>
      </>,
    );
    for (const sel of ['.ui-sheet-close', '.ui-dialog-close']) {
      const close = $(sel);
      expect(close.dataset.size).toBe('icon');
      expect(close.className).toContain('pointer-coarse:size-12');
    }
  });

  it('SaveBar buttons are standard size, so 48px on touch', () => {
    render(<SaveBar count={2} onSave={() => {}} onDiscard={() => {}} />);
    for (const b of document.querySelectorAll<HTMLElement>('.ui-save-bar button')) {
      expect(b.dataset.size).toBe('md');
      expect(b.className).toContain('pointer-coarse:min-h-12');
    }
  });

  it('SegmentedControl items are 48px', () => {
    render(
      <>
        <SegmentedControl
          label="View"
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ]}
        />
        <SegmentedControl
          label="Small"
          size="sm"
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ]}
        />
      </>,
    );
    const items = document.querySelectorAll('.ui-segmented-item');
    expect(items).toHaveLength(4);
    for (const i of items) expect(i.className).toContain('pointer-coarse:min-h-12');
  });

  it('NumberField steppers are 48px and the field makes room for them', () => {
    render(<NumberField aria-label="n" value={1} onValueChange={() => {}} />);
    for (const label of ['Increase', 'Decrease'])
      expect($(`button[aria-label="${label}"]`).className).toContain('pointer-coarse:size-12');
    expect($('.ui-number-field').className).toContain('pointer-coarse:p-0');
  });

  it('Switch: the label row is the 48px target', () => {
    render(<Switch checked={false} onCheckedChange={() => {}} label="Show data table" />);
    expect($('.ui-switch-row').className).toContain('pointer-coarse:min-h-12');
  });

  it('CommandPaletteButton is a 48px target even with only its icon showing', () => {
    render(<CommandPaletteButton />);
    expect($('.ui-palette-button').className).toContain('pointer-coarse:min-h-12');
    expect($('.ui-palette-button').className).toContain('pointer-coarse:min-w-12');
  });

  it('chart legend toggles are 48px', () => {
    render(<Legend items={[{ label: 'In' }, { label: 'Out', index: 1 }]} onToggle={() => {}} />);
    const buttons = document.querySelectorAll('.ui-chart-legend-btn');
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b.className).toContain('pointer-coarse:min-h-12');
  });

  it('a KpiTile with an href is one whole-card link: the label link stretches over the tile', () => {
    render(<KpiTile label="In stock" value={102} href="#/stock" />);
    const link = $('a');
    expect(link.className).toContain('after:absolute');
    expect(link.className).toContain('after:inset-0');
  });
});

describe('Photo corner and PhotoCapture busy', () => {
  it('the corner slot sits on a solid chip, so no photograph decides its contrast', () => {
    render(<Photo src={null} alt="Mattress" corner={<Button>Retake</Button>} />);
    const slot = $('[data-slot="corner"]');
    expect(slot.className).toContain('bg-surface-solid');
    expect(slot.contains($('button'))).toBe(true);
  });

  it('PhotoCapture busy uses the disabled role pair, never opacity, and announces politely', () => {
    render(<PhotoCapture onFile={() => {}} busy />);
    for (const label of document.querySelectorAll('.ui-photo-capture-option')) {
      expect(label.className).toContain('has-[input:disabled]:bg-disabled');
      expect(label.className).toContain('has-[input:disabled]:text-disabled-fg');
      expect(label.className).toContain('has-[input:disabled]:border-disabled-border');
      expect(label.className).not.toMatch(/(^|\s)opacity-/);
    }
    expect($('.ui-photo-capture').className).not.toMatch(/opacity-/);
    expect($('[role="status"]').textContent).toBe('Preparing photo…');
    render(<PhotoCapture onFile={() => {}} />);
    expect($('[role="status"]').textContent).toBe('');
  });
});

describe('ToggleGroup', () => {
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ];
  it('does not wrap by default and wraps with `wrap`', () => {
    render(<ToggleGroup type="single" label="Kinds" options={options} />);
    expect($('.ui-toggle-group').className).not.toContain('flex-wrap');
    render(<ToggleGroup type="single" label="Kinds" options={options} wrap />);
    expect($('.ui-toggle-group').className).toContain('flex-wrap');
  });
});

describe('Card interactive', () => {
  it('adds the pointer cursor, a hover edge and a focus-within ring only when asked', () => {
    render(
      <>
        <Card data-testid="plain">plain</Card>
        <Card interactive data-testid="tap" variant="sunken">
          tap
        </Card>
      </>,
    );
    expect($('[data-testid="plain"]').className).not.toContain('cursor-pointer');
    const tap = $('[data-testid="tap"]');
    expect(tap.className).toContain('cursor-pointer');
    expect(tap.className).toContain('hover:border-fg-muted');
    expect(tap.className).toContain('focus-within:');
  });
});

describe('RadioCards phoneColumns', () => {
  const options = ['A', 'B', 'C', 'D'].map((v) => ({ value: v, label: v }));
  it('is one column on a phone by default and two with phoneColumns={2}', () => {
    render(<RadioCards legend="Size" options={options} value={null} onValueChange={() => {}} />);
    expect($('.ui-radio-group div').className).toContain('grid-cols-1');
    render(
      <RadioCards
        legend="Size"
        options={options}
        value={null}
        onValueChange={() => {}}
        phoneColumns={2}
        columns={3}
      />,
    );
    const grid = $('.ui-radio-group div');
    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).toContain('sm:grid-cols-3');
  });
});

describe('KpiRow quiet error', () => {
  it('shows one muted line with Retry instead of the alert', () => {
    const onRetry = vi.fn<() => void>();
    render(
      <KpiRow
        errorStyle="quiet"
        error={{ what: 'the key figures', error: new Error('x'), onRetry }}
      />,
    );
    expect(document.querySelector('[role="alert"]')).toBeNull();
    const line = $('[role="status"]');
    expect(line.textContent).toContain('Couldn’t load the key figures');
    act(() => $<HTMLButtonElement>('button', line).click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the standard alert by default', () => {
    render(<KpiRow error={{ what: 'the key figures', error: new Error('x') }} />);
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe('Sheet footer', () => {
  const open = (props: Partial<Parameters<typeof Sheet>[0]> = {}) =>
    render(
      <Sheet
        open
        onOpenChange={() => {}}
        title="Filters"
        description="Narrow the list"
        footer={
          <>
            <Button>Clear</Button>
            <Button>Show</Button>
          </>
        }
        {...props}
      >
        body
      </Sheet>,
    );

  it('is right-aligned and scrolls with the body by default', () => {
    open();
    const footer = $('.ui-sheet-footer');
    expect(footer.className).toContain('justify-end');
    expect(footer.className).not.toContain('sticky');
  });

  it('stretches its buttons and sticks to the bottom when asked', () => {
    open({ footerLayout: 'stretch', stickyFooter: true });
    const footer = $('.ui-sheet-footer');
    expect(footer.className).not.toContain('justify-end');
    expect(footer.className).toContain('[&>*]:flex-1');
    expect(footer.className).toContain('sticky');
    expect(footer.className).toContain('safe-area-inset-bottom');
  });
});

describe('BulkActionBar sticky', () => {
  it('sits inline by default and pins above the tab bar and the safe area with `sticky`', () => {
    render(<BulkActionBar count={2} onClear={() => {}} />);
    expect($('.ui-bulk-bar').className).not.toContain('sticky');
    render(<BulkActionBar count={2} onClear={() => {}} sticky />);
    const bar = $('.ui-bulk-bar');
    expect(bar.className).toContain('sticky');
    expect(bar.className).toContain('--bottom-nav-h');
    expect(bar.className).toContain('safe-area-inset-bottom');
  });
});
