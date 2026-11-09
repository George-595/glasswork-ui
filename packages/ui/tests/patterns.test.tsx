// @vitest-environment jsdom
/* The page-level patterns (src/patterns): ListPage, DetailSheet, KpiRow, ChartGrid, FeedList,
   ActionList, SettingsLayout + SaveBar, the form pieces, AuthLayout, StatusPage, ToolLayout and
   PageHeader. Each gets its structure, semantics, keyboard behaviour and responsive classes
   checked; then four composed pages (list, settings, dashboard, sign-in) go through axe in
   every skin x mode. jsdom has no layout, so colour-contrast is off here (the colour gate and
   the browser pass hold it). */
import axe from 'axe-core';
import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMaterialMaps } from '../src/glass';
import {
  ActionItem,
  ActionList,
  AuthLayout,
  Badge,
  Button,
  Card,
  ChartCard,
  ChartGrid,
  ChartGridItem,
  type Column,
  DetailSection,
  DetailSheet,
  FeedItem,
  FeedList,
  FormActions,
  FormField,
  FormGrid,
  FormSection,
  Input,
  KpiRow,
  ListPage,
  PageHeader,
  PageLayout,
  SaveBar,
  SettingsLayout,
  SettingsSection,
  StatusPage,
  Textarea,
  ToolLayout,
  useDataTable,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const g = globalThis as { ResizeObserver?: unknown };
  g.ResizeObserver ??= ResizeObserverStub;
  const proto = Element.prototype as Partial<{
    hasPointerCapture: (id: number) => boolean;
    releasePointerCapture: (id: number) => void;
    setPointerCapture: (id: number) => void;
    scrollIntoView: () => void;
  }>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  clearMaterialMaps();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-skin');
});
afterAll(() => {
  document.body.replaceChildren();
});

function render(node: ReactNode) {
  act(() => root.render(node));
}
const $ = <E extends Element = HTMLElement>(sel: string, from: ParentNode = host) =>
  from.querySelector(sel) as E;
const $$ = (sel: string, from: ParentNode = host) =>
  Array.from(from.querySelectorAll<HTMLElement>(sel));
const classes = (el: Element) => Array.from(el.classList);
const click = (el: Element) => act(() => (el as HTMLElement).click());
const flush = () => act(async () => {});
const text = (el: Element | null) => el?.textContent ?? '';

/* ---- ListPage ---- */
interface Order {
  id: string;
  name: string;
  status: 'paid' | 'open';
  total: number;
}
const ORDERS: Order[] = [
  { id: 'a', name: 'Ada', status: 'paid', total: 120 },
  { id: 'b', name: 'Grace', status: 'open', total: 80 },
  { id: 'c', name: 'Linus', status: 'paid', total: 45 },
];
const COLUMNS: Column<Order>[] = [
  { key: 'name', header: 'Customer', sortable: true },
  { key: 'status', header: 'Status', facet: true, hideable: true },
  { key: 'total', header: 'Total', align: 'end', sortable: true },
];

function ListHarness({
  rows = ORDERS,
  ...props
}: Partial<Parameters<typeof ListPage<Order>>[0]> & { rows?: Order[] }) {
  const table = useDataTable({
    columns: COLUMNS,
    rows,
    rowKey: (o) => o.id,
    rowLabel: (o) => o.name,
  });
  return <ListPage table={table} caption="Orders" {...props} />;
}

describe('ListPage', () => {
  it('lays out actions, toolbar, table and pagination from a table api', () => {
    render(
      <ListHarness
        actions={<Button>Invite</Button>}
        search={{ placeholder: 'Find an order' }}
        columnToggle
        densityToggle
        toolbarActions={<Button variant="outline">Export</Button>}
      />,
    );
    expect($('.ui-list-actions')?.textContent).toBe('Invite');
    expect($('.ui-list-actions').className).toContain('justify-end');
    expect($('fieldset legend')?.textContent).toBe('Table controls');
    expect($('input[placeholder="Find an order"]')).not.toBeNull();
    expect($$('button').some((b) => b.textContent === 'Export')).toBe(true);
    expect($('table caption')?.textContent).toBe('Orders');
    expect($$('tbody tr')).toHaveLength(3);
    expect($('.ui-table-status')).not.toBeNull();
  });

  it('has no toolbar card when there is nothing to put in it', () => {
    render(<ListHarness facets={false} />);
    expect($('.ui-list-toolbar')).toBeNull();
  });

  it('shows the bulk bar only while rows are selected, with the actions given', () => {
    render(
      <ListHarness
        selectable
        bulkActions={(sel) => <Button size="sm">Archive {sel.size}</Button>}
      />,
    );
    expect($('[aria-label="Bulk actions"]')).toBeNull();
    click($('tbody input[type="checkbox"]'));
    const bar = $('[aria-label="Bulk actions"]');
    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain('1 selected');
    expect(bar.textContent).toContain('Archive 1');
  });

  it('draws the skeleton while loading, and no pagination', () => {
    render(<ListHarness loading rows={[]} />);
    expect($('.ui-skeleton-table, [aria-busy="true"]')).not.toBeNull();
    expect($('.ui-table-status')).toBeNull();
  });

  it('dims the frame and sets aria-busy while reloading with rows kept', () => {
    render(<ListHarness busy />);
    const frame = $('.ui-list-frame');
    expect(frame.getAttribute('aria-busy')).toBe('true');
    expect(classes(frame)).toContain('aria-busy:opacity-60');
    expect($$('tbody tr')).toHaveLength(3);
  });

  it('replaces the table with an alert and a working Retry on error', () => {
    const onRetry = vi.fn<() => void>();
    render(<ListHarness error={{ what: 'orders', error: new Error('boom'), onRetry }} />);
    expect($('[role="alert"]')?.textContent).toContain('Couldn’t load orders.');
    expect($('table')).toBeNull();
    click($$('button').find((b) => b.textContent === 'Retry') as HTMLElement);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('says nothing is here when there are no rows, and offers Clear filters when filtered', () => {
    render(<ListHarness rows={[]} />);
    expect(text($('tbody'))).toContain('Nothing here yet');
    expect($$('button').some((b) => b.textContent === 'Clear filters')).toBe(false);

    function Filtered() {
      const table = useDataTable({
        columns: COLUMNS,
        rows: ORDERS,
        rowKey: (o) => o.id,
        initialState: { search: 'zzz' },
      });
      return <ListPage table={table} caption="Orders" search />;
    }
    render(<Filtered />);
    expect(text($('tbody'))).toContain('Nothing matches these filters');
    const clear = $$('button').filter((b) => b.textContent === 'Clear filters');
    expect(clear.length).toBeGreaterThan(0);
    click(clear[clear.length - 1] as HTMLElement);
    expect($$('tbody tr')).toHaveLength(3);
  });

  it('takes a custom empty node and a detail slot', () => {
    render(
      <ListHarness rows={[]} empty={<p>No orders yet</p>} detail={<p id="detail">Sheet</p>} />,
    );
    expect(text($('tbody'))).toContain('No orders yet');
    expect($('#detail')).not.toBeNull();
  });

  it('opens a row through onRowClick', () => {
    const onRowClick = vi.fn<(o: Order) => void>();
    render(<ListHarness onRowClick={onRowClick} />);
    click($('tbody tr td button, tbody tr'));
    expect(onRowClick).toHaveBeenCalled();
  });
});

/* ---- DetailSheet ---- */
describe('DetailSheet', () => {
  const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;

  it('is a labelled modal with badges, a summary, sections and actions', async () => {
    render(
      <DetailSheet
        open
        onOpenChange={() => {}}
        title="Order 1001"
        subtitle="Placed 3 September"
        badges={<Badge>Paid</Badge>}
        summary={<strong>£120</strong>}
        actions={<Button>Refund</Button>}
      >
        <DetailSection title="Customer" items={[{ term: 'Name', detail: 'Ada' }]} />
      </DetailSheet>,
    );
    await flush();
    const d = dialog() as HTMLElement;
    expect(d.getAttribute('aria-labelledby')).toBeTruthy();
    expect(d.textContent).toContain('Order 1001');
    expect(d.textContent).toContain('Placed 3 September');
    expect(d.querySelector('.ui-detail-badges')?.textContent).toBe('Paid');
    expect(d.querySelector('.ui-detail-summary')?.textContent).toBe('£120');
    expect(d.querySelector('section h3')?.textContent).toBe('Customer');
    expect(d.querySelector('dl dt')?.textContent).toBe('Name');
    expect(d.querySelector('.ui-sheet-footer')?.textContent).toBe('Refund');
  });

  it('keeps the description for screen readers when there is no subtitle', async () => {
    render(
      <DetailSheet open onOpenChange={() => {}} title="Order">
        body
      </DetailSheet>,
    );
    await flush();
    const desc = document.querySelector('.ui-sheet-description') as HTMLElement;
    expect(desc.className).toContain('ui-sr-only');
  });

  it('shows a loading region, then runs the children function only when ready', async () => {
    const children = vi.fn<() => ReactNode>(() => <p id="ready">Ready</p>);
    render(
      <DetailSheet open onOpenChange={() => {}} title="Order" what="order" loading>
        {children}
      </DetailSheet>,
    );
    await flush();
    expect(dialog()?.querySelector('[aria-label="Loading order"]')).not.toBeNull();
    expect(children).not.toHaveBeenCalled();
    render(
      <DetailSheet open onOpenChange={() => {}} title="Order" what="order">
        {children}
      </DetailSheet>,
    );
    await flush();
    expect(document.getElementById('ready')).not.toBeNull();
  });

  it('shows the error state with Retry, or a custom one', async () => {
    const onRetry = vi.fn<() => void>();
    render(
      <DetailSheet
        open
        onOpenChange={() => {}}
        title="Order"
        what="order"
        error={new Error('nope')}
        onRetry={onRetry}
        badges={<Badge>Paid</Badge>}
        actions={<Button>Refund</Button>}
      >
        body
      </DetailSheet>,
    );
    await flush();
    const d = dialog() as HTMLElement;
    expect(d.querySelector('[role="alert"]')?.textContent).toContain('Couldn’t load order.');
    expect(d.querySelector('.ui-detail-badges')).toBeNull();
    expect(d.querySelector('.ui-sheet-footer')).toBeNull();
    click(
      Array.from(d.querySelectorAll('button')).find((b) => b.textContent === 'Retry') as Element,
    );
    expect(onRetry).toHaveBeenCalledOnce();

    render(
      <DetailSheet
        open
        onOpenChange={() => {}}
        title="Order"
        error="x"
        renderError={(e) => <p id="custom">Custom {String(e)}</p>}
      />,
    );
    await flush();
    expect(document.getElementById('custom')?.textContent).toBe('Custom x');
  });

  it('closes on Escape', async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(
      <DetailSheet open onOpenChange={onOpenChange} title="Order">
        body
      </DetailSheet>,
    );
    await flush();
    act(() => {
      (dialog() as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

/* ---- KpiRow ---- */
describe('KpiRow', () => {
  const items = [
    { label: 'Revenue', value: 1200, delta: 0.04 },
    { label: 'Orders', value: 80 },
    { label: 'Users', value: 12 },
    { label: 'Churn', value: 2 },
  ];

  it('is a named group of tiles in a 1 / 2 / 4 column grid', () => {
    render(<KpiRow items={items} label="Key figures" />);
    const row = $('.ui-kpi-row');
    expect(row.getAttribute('role')).toBe('group');
    expect(row.getAttribute('aria-label')).toBe('Key figures');
    expect(classes(row)).toEqual(
      expect.arrayContaining(['grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-4']),
    );
    expect($$('.ui-kpi', row)).toHaveLength(4);
  });

  it('draws n skeletons in a loading region while loading', () => {
    render(<KpiRow loading skeletons={3} label="revenue figures" />);
    expect($$('.ui-kpi-skeleton')).toHaveLength(3);
    expect($('[aria-label="Loading revenue figures"]').getAttribute('aria-busy')).toBe('true');
    expect($('[role="status"]').textContent).toContain('Loading revenue figures');
  });

  it('shows the error state instead of the tiles', () => {
    const onRetry = vi.fn<() => void>();
    render(<KpiRow items={items} error={{ what: 'key figures', error: 'down', onRetry }} />);
    expect($('[role="alert"]').textContent).toContain('Couldn’t load key figures.');
    expect($('.ui-kpi')).toBeNull();
    click($('[role="alert"] button'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('takes its own column counts', () => {
    render(<KpiRow items={items} cols={{ base: 2, xl: 4 }} />);
    expect(classes($('.ui-kpi-row'))).toEqual(
      expect.arrayContaining(['grid-cols-2', 'xl:grid-cols-4']),
    );
  });
});

/* ---- ChartGrid ---- */
describe('ChartGrid', () => {
  it('is one column on a phone and twelve tracks from 768px', () => {
    render(
      <ChartGrid>
        <ChartGridItem span="wide">a</ChartGridItem>
      </ChartGrid>,
    );
    expect(classes($('.ui-chart-grid'))).toEqual(
      expect.arrayContaining(['grid-cols-1', 'md:grid-cols-12']),
    );
  });

  it('gives each span its own responsive classes', () => {
    render(
      <ChartGrid>
        <ChartGridItem span="wide">w</ChartGridItem>
        <ChartGridItem span="half">h</ChartGridItem>
        <ChartGridItem span="third">t</ChartGridItem>
        <ChartGridItem span="two-thirds">tt</ChartGridItem>
      </ChartGrid>,
    );
    const by = (s: string) => classes($(`[data-span="${s}"]`));
    expect(by('wide')).toContain('col-span-full');
    expect(by('half')).toEqual(expect.arrayContaining(['col-span-full', 'md:col-span-6']));
    expect(by('third')).toEqual(
      expect.arrayContaining(['col-span-full', 'md:col-span-6', 'lg:col-span-4']),
    );
    expect(by('two-thirds')).toEqual(
      expect.arrayContaining(['col-span-full', 'md:col-span-full', 'lg:col-span-8']),
    );
  });

  it('lets the card inside fill the item', () => {
    render(
      <ChartGrid>
        <ChartGridItem>
          <ChartCard title="Revenue" empty />
        </ChartGridItem>
      </ChartGrid>,
    );
    expect(classes($('.ui-chart-grid-item'))).toEqual(
      expect.arrayContaining(['flex', 'flex-col', '*:flex-1']),
    );
    expect($('.ui-chart-grid-item h3')?.textContent).toBe('Revenue');
  });
});

/* ---- FeedList / ActionList ---- */
describe('FeedList', () => {
  it('is a real list of items with an avatar or an icon, meta and a trailing badge', () => {
    render(
      <FeedList aria-label="Recent activity">
        <FeedItem
          avatar="Ada Lovelace"
          title="Paid invoice 12"
          meta={<time dateTime="2026-10-01">1 Oct</time>}
          trailing={<Badge>Payment</Badge>}
        />
        <FeedItem icon="database" title="Deployed" />
      </FeedList>,
    );
    const ul = $('ul');
    expect(ul.getAttribute('aria-label')).toBe('Recent activity');
    expect($$('li', ul)).toHaveLength(2);
    expect($$('li')[0]?.querySelector('.ui-avatar, [data-size]')).not.toBeNull();
    expect($$('li')[0]?.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-01');
    expect($$('li')[0]?.textContent).toContain('Payment');
    expect($$('li')[1]?.querySelector('.ui-feed-icon svg')).not.toBeNull();
    // no target, so no link or button
    expect($('a, button')).toBeNull();
  });

  it('wraps the row in one link, a button, or a router link', () => {
    const onClick = vi.fn<() => void>();
    function RouterLink({
      to,
      className,
      children,
    }: {
      to: string;
      className?: string;
      children?: ReactNode;
    }) {
      return (
        <a data-to={to} href={`#${to}`} className={className}>
          {children}
        </a>
      );
    }
    render(
      <FeedList aria-label="Feed">
        <FeedItem title="One" href="/one" />
        <FeedItem title="Two" onClick={onClick} />
        <FeedItem title="Three" linkAs={RouterLink} linkProps={{ to: '/three' }} />
      </FeedList>,
    );
    expect($('li a[href="/one"]')?.textContent).toBe('One');
    click($('li button'));
    expect(onClick).toHaveBeenCalledOnce();
    expect($('li a[data-to="/three"]')).not.toBeNull();
    expect($$('a, button')).toHaveLength(3);
    expect(classes($('li a')).join(' ')).toContain('focus-visible:[box-shadow:var(--ring)]');
  });
});

describe('ActionList', () => {
  it('is a real list of links and buttons with an icon, description and chevron', () => {
    const onClick = vi.fn<() => void>();
    render(
      <>
        <h2 id="qa">Quick actions</h2>
        <ActionList aria-labelledby="qa">
          <ActionItem icon="plus" title="New invite" description="Add someone" href="/invite" />
          <ActionItem icon="table" title="Export" description="Download a CSV" onClick={onClick} />
        </ActionList>
      </>,
    );
    const ul = $('ul');
    expect(ul.getAttribute('aria-labelledby')).toBe('qa');
    expect($$('li')).toHaveLength(2);
    const link = $('li a');
    expect(link.getAttribute('href')).toBe('/invite');
    expect(link.textContent).toContain('New invite');
    expect(link.textContent).toContain('Add someone');
    expect(link.querySelector('svg')).not.toBeNull();
    click($('li button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('can drop the chevron', () => {
    render(
      <ActionList aria-label="Actions">
        <ActionItem title="Go" href="/go" chevron={false} />
      </ActionList>,
    );
    expect($('li a svg')).toBeNull();
  });
});

/* ---- SettingsLayout / SettingsSection / SaveBar ---- */
const SECTIONS = [
  { id: 'general', label: 'General', icon: 'settings' as const },
  { id: 'appearance', label: 'Appearance' },
  { id: 'connections', label: 'Connections' },
];

describe('SettingsLayout', () => {
  it('has a nav of buttons (desktop) and a select (mobile) over one panel', () => {
    render(
      <SettingsLayout sections={SECTIONS}>{(value) => <p id="shown">{value}</p>}</SettingsLayout>,
    );
    const nav = $('nav');
    expect(nav.getAttribute('aria-label')).toBe('Settings sections');
    expect(classes(nav)).toEqual(expect.arrayContaining(['hidden', 'lg:block']));
    expect($$('nav button')).toHaveLength(3);
    const select = $<HTMLSelectElement>('select');
    expect(select.closest('.lg\\:hidden')).not.toBeNull();
    expect($$('option', select)).toHaveLength(3);
    expect($('label[for]')?.textContent).toBe('Section');
    expect($('#shown').textContent).toBe('general');
    expect(classes($('.ui-settings-nav'))).toEqual(
      expect.arrayContaining(['lg:sticky', 'lg:top-6']),
    );
  });

  it('marks the chosen section with aria-current and changes on click', () => {
    const onValueChange = vi.fn<(id: string) => void>();
    render(
      <SettingsLayout sections={SECTIONS} onValueChange={onValueChange}>
        {(v) => <p id="shown">{v}</p>}
      </SettingsLayout>,
    );
    const buttons = $$('nav button');
    expect(buttons[0]?.getAttribute('aria-current')).toBe('true');
    expect(buttons[1]?.hasAttribute('aria-current')).toBe(false);
    click(buttons[1] as HTMLElement);
    expect(onValueChange).toHaveBeenCalledWith('appearance');
    expect($$('nav button')[1]?.getAttribute('aria-current')).toBe('true');
    expect($('#shown').textContent).toBe('appearance');
    expect($$('nav button')[1]?.getAttribute('aria-controls')).toBe($('.ui-settings-panel').id);
  });

  it('is controlled when given a value, and the select drives it too', () => {
    function C() {
      const [v, setV] = useState('connections');
      return (
        <SettingsLayout sections={SECTIONS} value={v} onValueChange={setV}>
          {(x) => <p id="shown">{x}</p>}
        </SettingsLayout>
      );
    }
    render(<C />);
    expect($('#shown').textContent).toBe('connections');
    const select = $<HTMLSelectElement>('select');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(select, 'general');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect($('#shown').textContent).toBe('general');
  });

  it('is reachable and operable by keyboard: native buttons in tab order', () => {
    render(<SettingsLayout sections={SECTIONS}>x</SettingsLayout>);
    for (const b of $$('nav button')) expect(b.tabIndex).toBe(0);
  });
});

describe('SettingsSection', () => {
  it('is a card with an h2 title, a description, actions and a focus target', () => {
    render(
      <SettingsSection
        title="General"
        description="The workspace name."
        actions={<Button size="sm">Test</Button>}
      >
        <p>body</p>
      </SettingsSection>,
    );
    expect($('h2').textContent).toBe('General');
    expect(text($('.ui-card-description'))).toBe('The workspace name.');
    expect($('h2').parentElement?.getAttribute('tabindex')).toBe('-1');
    expect(text($('.ui-settings-section'))).toContain('Test');
  });
});

describe('SaveBar', () => {
  it('renders nothing visible at 0 but keeps the live region mounted', () => {
    render(<SaveBar count={0} onSave={() => {}} onDiscard={() => {}} />);
    expect($('.ui-save-bar')).toBeNull();
    expect($('[role="status"]')).not.toBeNull();
    expect(text($('[role="status"]'))).toBe('');
  });

  it('says "N unsaved changes", announces politely, and is a sticky named region', () => {
    render(<SaveBar count={3} onSave={() => {}} onDiscard={() => {}} />);
    expect(text($('[role="status"]'))).toBe('3 unsaved changes');
    const bar = $('.ui-save-bar');
    expect(bar.getAttribute('role')).toBe('region');
    expect(bar.getAttribute('aria-label')).toBe('Unsaved changes');
    expect(classes(bar)).toContain('sticky');
    // pinned clear of the safe area on a desktop, and above the phone tab bar under 768px
    expect(bar.className).toContain('safe-area-inset-bottom');
    expect(bar.className).toContain('max-md:bottom-[calc(var(--bottom-nav-h,0px)');
    expect(bar.textContent).toContain('3 unsaved changes');
    expect($$('[role="status"]')).toHaveLength(1);
  });

  it('uses the singular and a custom unit', () => {
    render(<SaveBar count={1} unit="setting" onSave={() => {}} onDiscard={() => {}} />);
    expect(text($('[role="status"]'))).toBe('1 unsaved setting');
  });

  it('puts Discard before the primary Save and calls them', () => {
    const onSave = vi.fn<() => void>();
    const onDiscard = vi.fn<() => void>();
    render(<SaveBar count={2} onSave={onSave} onDiscard={onDiscard} />);
    const [discard, save] = $$('.ui-save-bar button');
    expect(discard?.textContent).toBe('Discard');
    expect(save?.textContent).toBe('Save');
    expect(save?.getAttribute('data-variant')).toBe('primary');
    click(discard as HTMLElement);
    click(save as HTMLElement);
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('keeps focus on Save and ignores a second press while saving', () => {
    const onSave = vi.fn<() => void>();
    render(<SaveBar count={2} saving onSave={onSave} onDiscard={() => {}} />);
    const save = $$('.ui-save-bar button')[1] as HTMLElement;
    expect(save.textContent).toBe('Saving…');
    expect(save.getAttribute('aria-disabled')).toBe('true');
    expect(save.hasAttribute('disabled')).toBe(false);
    click(save);
    expect(onSave).not.toHaveBeenCalled();
  });
});

/* ---- forms ---- */
describe('FormField', () => {
  it('wires id, description and a label to a single child control', () => {
    render(
      <FormField label="Email" description="We never share it.">
        <Input type="email" />
      </FormField>,
    );
    const input = $<HTMLInputElement>('input');
    const label = $<HTMLLabelElement>('label');
    expect(input.id).toBeTruthy();
    expect(label.htmlFor).toBe(input.id);
    const desc = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(desc?.textContent).toBe('We never share it.');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('marks the control invalid and describes it by the error, in a polite live region', () => {
    render(
      <FormField label="Email" description="Help" error="Enter an email address." required>
        <Input />
      </FormField>,
    );
    const input = $<HTMLInputElement>('input');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-required')).toBe('true');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toHaveLength(2);
    const err = document.getElementById(ids[1] as string) as HTMLElement;
    expect(err.getAttribute('aria-live')).toBe('polite');
    expect(err.textContent).toBe('Enter an email address.');
    expect(err.querySelector('svg')).not.toBeNull();
    expect($('label span[aria-hidden="true"]')?.textContent).toContain('*');
  });

  it('keeps a mounted, empty live region while valid, and keeps the control’s own id and describedby', () => {
    render(
      <FormField label="Name" description="Help" id="mine">
        <Input id="own" aria-describedby="extra" />
      </FormField>,
    );
    const input = $<HTMLInputElement>('input');
    expect(input.id).toBe('own');
    expect(input.getAttribute('aria-describedby')?.startsWith('extra ')).toBe(true);
    expect($('[aria-live="polite"]').textContent).toBe('');
  });

  it('supports a render prop for controls that take the props themselves', () => {
    render(
      <FormField label="Notes" error="Too long">
        {(c) => <Textarea {...c} />}
      </FormField>,
    );
    const ta = $<HTMLTextAreaElement>('textarea');
    expect(ta.getAttribute('aria-invalid')).toBe('true');
    expect($<HTMLLabelElement>('label').htmlFor).toBe(ta.id);
  });

  it('can hide the label visually and still name the control', () => {
    render(
      <FormField label="Search" hideLabel>
        <Input />
      </FormField>,
    );
    expect($('label').className).toContain('ui-sr-only');
  });
});

describe('FormSection, FormGrid, FormActions', () => {
  it('FormSection is a named region with a heading and spaced fields', () => {
    render(
      <FormSection title="Profile" description="Public details.">
        <FormField label="Name">
          <Input />
        </FormField>
      </FormSection>,
    );
    const section = $('section');
    expect(section.getAttribute('aria-labelledby')).toBe($('h3').id);
    expect($('h3').textContent).toBe('Profile');
    expect(text(section)).toContain('Public details.');
  });

  it('FormGrid is one column, or two from 768px', () => {
    render(<FormGrid>a</FormGrid>);
    expect(classes($('.ui-form-grid'))).toEqual(
      expect.arrayContaining(['grid-cols-1', 'md:grid-cols-2']),
    );
    render(<FormGrid columns={1}>a</FormGrid>);
    expect(classes($('.ui-form-grid'))).not.toContain('md:grid-cols-2');
  });

  it('FormActions end-aligns its buttons and can draw a divider', () => {
    render(
      <FormActions divided>
        <Button variant="ghost">Cancel</Button>
        <Button>Save</Button>
      </FormActions>,
    );
    const el = $('.ui-form-actions');
    expect(classes(el)).toEqual(expect.arrayContaining(['justify-end', 'flex-wrap', 'border-t']));
    expect($$('button').map((b) => b.textContent)).toEqual(['Cancel', 'Save']);
  });
});

/* ---- AuthLayout ---- */
describe('AuthLayout', () => {
  const page = (
    <AuthLayout
      brand={<span>Acme</span>}
      aside={
        <ul>
          <li>Fast</li>
        </ul>
      }
      title="Sign in"
      description="Welcome back."
      notice={<p role="alert">Wrong password</p>}
      form={
        <form aria-label="Sign in">
          <FormField label="Email">
            <Input />
          </FormField>
        </form>
      }
      footer={<a href="/help">Need help?</a>}
      backdrop={<div id="bg" />}
    />
  );

  it('is the page’s main with the one h1, the form and the slots', () => {
    render(page);
    const main = $('main');
    expect(main.id).toBe('main');
    expect(main.tabIndex).toBe(-1);
    expect($$('h1')).toHaveLength(1);
    expect($('h1').textContent).toBe('Sign in');
    expect(text(main)).toContain('Welcome back.');
    expect($('[role="alert"]').textContent).toBe('Wrong password');
    expect($('form input')).not.toBeNull();
    expect($('a[href="/help"]')).not.toBeNull();
    expect($('#bg').parentElement?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the brand panel from 1024px in enterprise and a mark above the title otherwise', () => {
    render(page);
    expect(classes($('.ui-auth-brand'))).toEqual(
      expect.arrayContaining(['hidden', 'lg:flex', 'glass:hidden!']),
    );
    expect(text($('.ui-auth-brand'))).toContain('Acme');
    expect(classes($('.ui-auth-mark'))).toEqual(
      expect.arrayContaining(['lg:hidden', 'glass:block!']),
    );
    expect(classes($('.ui-auth'))).toEqual(
      expect.arrayContaining(['lg:grid-cols-2', 'glass:grid-cols-1', 'glass:place-items-center']),
    );
  });

  it('makes the form panel a glass card in the glass skin', () => {
    render(page);
    expect(classes($('.ui-auth-panel'))).toEqual(
      expect.arrayContaining(['glass:max-w-md', 'glass:bg-surface', 'glass:rounded-xl']),
    );
  });
});

/* ---- StatusPage ---- */
describe('StatusPage', () => {
  it('is a centred empty state with the code, a title heading and both actions', () => {
    render(
      <StatusPage
        code="404"
        icon="search"
        title="We can't find that page"
        description="Moved or mistyped."
        primaryAction={<a href="/">Go home</a>}
        secondaryAction={<Button variant="outline">Go back</Button>}
        backdrop={<div id="bg" />}
      />,
    );
    expect($('.ui-status-page')).not.toBeNull();
    expect(text($('.ui-status-page'))).toContain('Error 404');
    expect($('h2').textContent).toBe("We can't find that page");
    expect($$('.ui-empty-state-action > *').map((e) => e.textContent)).toEqual([
      'Go home',
      'Go back',
    ]);
    expect($('#bg').parentElement?.getAttribute('aria-hidden')).toBe('true');
  });

  it('can use another heading level and needs no actions', () => {
    render(<StatusPage title="Not allowed" headingLevel={3} />);
    expect($('h3').textContent).toBe('Not allowed');
    expect($('.ui-empty-state-action')).toBeNull();
  });
});

/* ---- ToolLayout ---- */
describe('ToolLayout', () => {
  it('has a sticky inputs column and a results column that stack on small screens', () => {
    render(
      <ToolLayout
        inputs={
          <FormField label="Amount">
            <Input />
          </FormField>
        }
        results={<p id="res">£100</p>}
        inputsActions={
          <Button variant="ghost" size="sm">
            Reset
          </Button>
        }
      />,
    );
    const grid = $('.ui-tool');
    expect(classes(grid)).toEqual(expect.arrayContaining(['grid', 'grid-cols-[minmax(0,1fr)]']));
    expect(classes(grid).some((c) => c.startsWith('lg:grid-cols-'))).toBe(true);
    expect(classes($('.ui-tool-inputs'))).toEqual(
      expect.arrayContaining(['lg:sticky', 'lg:top-6']),
    );
    expect($$('h2').map((h) => h.textContent)).toEqual(['Inputs', 'Results']);
    expect($$('section')).toHaveLength(2);
    // inputs first in the DOM: reading and tab order on a phone
    expect($('.ui-tool').firstElementChild?.className).toContain('ui-tool-inputs');
    expect($('#res')).not.toBeNull();
    expect(text($('.ui-tool-inputs'))).toContain('Reset');
  });

  it('announces changing results politely when asked', () => {
    render(<ToolLayout inputs="i" results="r" announce resultsTitle="Projection" />);
    expect($('[aria-live="polite"]')).not.toBeNull();
    expect($$('h2')[1]?.textContent).toBe('Projection');
  });
});

/* ---- PageHeader / PageLayout ---- */
describe('PageHeader', () => {
  it('is a header with breadcrumbs, eyebrow, the h1, a description, actions and a toolbar', () => {
    render(
      <PageHeader
        breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Users' }]}
        eyebrow="Admin"
        title="Users"
        description="People who can sign in."
        actions={<Button>Invite</Button>}
        toolbar={<span id="range">30 days</span>}
      />,
    );
    expect($('header')).not.toBeNull();
    expect($('nav[aria-label="Breadcrumb"]')).not.toBeNull();
    expect($('h1').textContent).toBe('Users');
    expect(text($('header'))).toContain('Admin');
    expect(text($('header'))).toContain('People who can sign in.');
    expect(text($('header'))).toContain('Invite');
    expect($('#range')).not.toBeNull();
    expect($('h1').closest('div')?.className).toContain('flex-[1_1_20rem]');
  });

  it('keeps only an sr-only h1 when the title is hidden', () => {
    render(<PageHeader title="Page not found" description="Gone." titleHidden />);
    expect(classes($('header'))).toContain('sr-only');
    expect($('h1').textContent).toBe('Page not found');
    expect(text($('header'))).not.toContain('Gone.');
  });

  it('can keep the h1 for screen readers only on a phone, and as usual from 768px', () => {
    render(<PageHeader title="Home" titleHiddenOnPhone />);
    expect(classes($('header'))).toContain('max-md:sr-only');
    expect(classes($('h1'))).toContain('max-md:sr-only');
    expect($('h1').textContent).toBe('Home');
    // with more than a title, only the h1 goes: the description stays on screen
    render(<PageHeader title="Stock" description="Find an item." titleHiddenOnPhone />);
    expect(classes($('header'))).not.toContain('max-md:sr-only');
    expect(classes($('h1'))).toContain('max-md:sr-only');
    expect(text($('header'))).toContain('Find an item.');
  });

  it('leaves out what it is not given', () => {
    render(<PageHeader title="Home" />);
    expect($('nav')).toBeNull();
    expect($$('p')).toHaveLength(0);
  });

  it('PageLayout puts the header above a spaced body', () => {
    render(
      <PageLayout title="Home">
        <p id="a">a</p>
        <p id="b">b</p>
      </PageLayout>,
    );
    expect($('.ui-page-layout').firstElementChild?.tagName).toBe('HEADER');
    expect($('#a').parentElement?.className).toContain('gap-6');
  });
});

/* ---- axe: four composed pages, every skin x mode ---- */
function ListPageComposed() {
  const table = useDataTable({
    columns: COLUMNS,
    rows: ORDERS,
    rowKey: (o) => o.id,
    rowLabel: (o) => o.name,
  });
  return (
    <main>
      <PageLayout
        title="Orders"
        eyebrow="Sales"
        description="Every order."
        actions={<Button>New order</Button>}
      >
        <ListPage
          table={table}
          caption="Orders"
          search
          columnToggle
          densityToggle
          selectable
          toolbarActions={
            <Button variant="outline" size="sm">
              Export CSV
            </Button>
          }
          bulkActions={<Button size="sm">Archive</Button>}
          detail={
            <DetailSheet open={false} onOpenChange={() => {}} title="Order a">
              x
            </DetailSheet>
          }
        />
      </PageLayout>
    </main>
  );
}

function SettingsComposed() {
  return (
    <main>
      <PageLayout title="Settings" eyebrow="Admin">
        <SettingsLayout sections={SECTIONS} defaultValue="general">
          {(v) => (
            <SettingsSection title={v === 'general' ? 'General' : 'Other'} description="Basics.">
              <FormSection title="Workspace">
                <FormGrid>
                  <FormField label="Name" description="Shown in the topbar." required>
                    <Input defaultValue="Acme" />
                  </FormField>
                  <FormField label="Contact" error="Enter an email address.">
                    <Input defaultValue="nope" />
                  </FormField>
                </FormGrid>
                <FormField label="About">
                  <Textarea defaultValue="Hello" />
                </FormField>
                <FormActions divided>
                  <Button variant="ghost">Cancel</Button>
                  <Button>Save</Button>
                </FormActions>
              </FormSection>
            </SettingsSection>
          )}
        </SettingsLayout>
        <SaveBar count={2} onSave={() => {}} onDiscard={() => {}} />
      </PageLayout>
    </main>
  );
}

function DashboardComposed() {
  return (
    <main>
      <PageLayout title="Overview" eyebrow="Dashboard">
        <KpiRow
          items={[
            { label: 'Revenue', value: 1200, delta: 0.04, trend: [1, 3, 2, 4] },
            { label: 'Orders', value: 80, previous: 70 },
          ]}
        />
        <ChartGrid>
          <ChartGridItem span="two-thirds">
            <ChartCard title="Revenue" empty />
          </ChartGridItem>
          <ChartGridItem span="third">
            <ChartCard title="Spend" empty />
          </ChartGridItem>
          <ChartGridItem span="half">
            <Card>
              <h3 id="feed">Recent activity</h3>
              <FeedList aria-labelledby="feed">
                <FeedItem
                  avatar="Ada Lovelace"
                  title="Paid"
                  meta="1 Oct"
                  trailing={<Badge>Payment</Badge>}
                />
                <FeedItem icon="database" title="Deployed" href="/deploys" />
              </FeedList>
            </Card>
          </ChartGridItem>
          <ChartGridItem span="half">
            <Card>
              <h3 id="qa">Quick actions</h3>
              <ActionList aria-labelledby="qa">
                <ActionItem
                  icon="plus"
                  title="New invite"
                  description="Add someone"
                  href="/invite"
                />
                <ActionItem icon="table" title="Export" description="Download" onClick={() => {}} />
              </ActionList>
            </Card>
          </ChartGridItem>
        </ChartGrid>
      </PageLayout>
    </main>
  );
}

function AuthComposed() {
  return (
    <AuthLayout
      brand={<span>Acme</span>}
      aside={<p>Calm dashboards.</p>}
      title="Sign in"
      description="Welcome back."
      form={
        <form aria-label="Sign in" noValidate>
          <FormField label="Email" required>
            <Input type="email" />
          </FormField>
          <FormActions>
            <Button type="submit">Sign in</Button>
          </FormActions>
        </form>
      }
      footer={<a href="/help">Need help?</a>}
    />
  );
}

const PAGES: [string, () => ReactNode][] = [
  ['list page', () => <ListPageComposed />],
  ['settings page', () => <SettingsComposed />],
  ['dashboard', () => <DashboardComposed />],
  ['auth page', () => <AuthComposed />],
];

describe('axe: composed pages, every skin and mode', () => {
  for (const [name, make] of PAGES) {
    for (const skin of ['enterprise', 'glass'] as const) {
      for (const mode of ['light', 'dark'] as const) {
        it(`${name} · ${skin} · ${mode}`, async () => {
          document.documentElement.setAttribute('data-skin', skin);
          document.documentElement.setAttribute('data-theme', mode);
          render(make());
          const results = await axe.run(document.body, {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
            },
            rules: { 'color-contrast': { enabled: false } },
            resultTypes: ['violations'],
          });
          const report = results.violations
            .map(
              (v) =>
                `${v.id}: ${v.help}\n${v.nodes.map((n) => `  ${n.target.join(' ')}`).join('\n')}`,
            )
            .join('\n');
          expect(report).toBe('');
        });
      }
    }
  }
});
