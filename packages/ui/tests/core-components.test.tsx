// @vitest-environment jsdom
/* The core components pages are made of: layout (Stack, Cluster, Grid, GridItem, Section,
   PageGrid, Spacer), type (Heading, Text, Eyebrow, Num, Code) and the Card variants. Props go
   in, the expected structure and role classes come out; then one composed page goes through
   axe in every skin x mode. jsdom has no layout, so colour-contrast is off here (the colour
   gate and the browser pass hold it). */
import axe from 'axe-core';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearMaterialMaps } from '../src/glass';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Cluster,
  Code,
  Eyebrow,
  Grid,
  GridItem,
  Heading,
  Num,
  PageGrid,
  Panel,
  Section,
  Spacer,
  Stack,
  TEXT_TONE,
  Text,
  type TextTone,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function render(node: ReactNode) {
  act(() => root.render(node));
  return host;
}
const first = () => host.firstElementChild as HTMLElement;
const classes = (el: Element) => Array.from(el.classList);

describe('Stack and Cluster', () => {
  it('stacks with the gap from the scale and lets children shrink', () => {
    render(
      <Stack gap={5} align="center">
        children
      </Stack>,
    );
    const c = classes(first());
    expect(c).toEqual(
      expect.arrayContaining(['flex', 'flex-col', 'gap-6', 'items-center', 'min-w-0', '*:min-w-0']),
    );
  });

  it('takes a responsive gap', () => {
    render(<Stack gap={{ base: 2, md: 6 }} />);
    expect(classes(first())).toEqual(expect.arrayContaining(['gap-2', 'md:gap-8']));
  });

  it('renders the element asked for', () => {
    render(<Stack as="ul" />);
    expect(first().tagName).toBe('UL');
  });

  it('wraps a cluster by default and aligns it', () => {
    render(<Cluster justify="between" gap={2} />);
    const c = classes(first());
    expect(c).toEqual(
      expect.arrayContaining(['flex', 'flex-wrap', 'justify-between', 'items-center', 'gap-2']),
    );
    render(<Cluster nowrap />);
    expect(classes(first())).toContain('flex-nowrap');
  });

  it('Spacer is decorative and takes the free room', () => {
    render(<Spacer />);
    expect(first().getAttribute('aria-hidden')).toBe('true');
    expect(classes(first())).toContain('flex-1');
  });
});

describe('Grid, GridItem and PageGrid', () => {
  it('uses shrinkable equal tracks for a number of columns', () => {
    render(<Grid cols={3} gap={3} />);
    expect(classes(first())).toEqual(
      expect.arrayContaining(['grid', 'grid-cols-3', 'gap-3', 'min-w-0']),
    );
  });

  it('maps a responsive cols object to breakpoint classes', () => {
    render(<Grid cols={{ base: 1, sm: 2, lg: 4 }} />);
    expect(classes(first())).toEqual(
      expect.arrayContaining(['grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-4']),
    );
    expect(classes(first())).not.toContain('md:grid-cols-2');
  });

  it('auto-fits by minimum item width instead of a column count', () => {
    render(<Grid cols={3} minItemWidth={220} />);
    expect(first().style.gridTemplateColumns).toBe(
      'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
    );
    expect(classes(first())).not.toContain('grid-cols-3');
  });

  it('GridItem spans columns and rows, responsively', () => {
    render(<GridItem span={{ base: 'full', md: 2 }} rowSpan={2} />);
    expect(classes(first())).toEqual(
      expect.arrayContaining(['col-span-full', 'md:col-span-2', 'row-span-2', 'min-w-0']),
    );
  });

  it('PageGrid stacks, then splits at the breakpoint, with minmax(0) columns', () => {
    render(<PageGrid layout="3-1" />);
    expect(classes(first())).toEqual(
      expect.arrayContaining([
        'grid-cols-[minmax(0,1fr)]',
        'lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]',
      ]),
    );
    expect(first().getAttribute('data-layout')).toBe('3-1');
    render(<PageGrid layout="sidebar" stackBelow="md" />);
    expect(classes(first())).toContain('md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]');
  });
});

describe('Section', () => {
  it('is a region named by its heading, at the level asked for', () => {
    render(
      <Section
        title="Orders"
        description="Last 30 days"
        actions={<Button size="sm">Export</Button>}
        level={3}
      >
        <p>body</p>
      </Section>,
    );
    const section = host.querySelector('section') as HTMLElement;
    const h = host.querySelector('h3') as HTMLElement;
    expect(h.textContent).toBe('Orders');
    expect(section.getAttribute('aria-labelledby')).toBe(h.id);
    expect(h.id).not.toBe('');
    expect(host.textContent).toContain('Last 30 days');
    expect(host.querySelector('button')?.textContent).toBe('Export');
    expect(host.querySelector('h2')).toBeNull();
  });

  it('defaults to h2 and can hide the title visually while keeping it for screen readers', () => {
    render(<Section title="Filters" hideTitle />);
    const h = host.querySelector('h2') as HTMLElement;
    expect(h).not.toBeNull();
    expect(h.classList.contains('ui-sr-only')).toBe(true);
  });
});

describe('Heading', () => {
  it.each([1, 2, 3, 4] as const)('level %i renders h%i', (level) => {
    render(<Heading level={level}>T</Heading>);
    expect(first().tagName).toBe(`H${level}`);
  });

  it('looks like its level unless sized, and uses the font token whole', () => {
    render(<Heading level={2}>T</Heading>);
    expect(classes(first())).toContain('[font:var(--t-h2)]');
    render(
      <Heading level={3} size={1}>
        T
      </Heading>,
    );
    expect(first().tagName).toBe('H3');
    expect(classes(first())).toContain('[font:var(--t-h1)]');
  });
});

describe('Text, Eyebrow, Num and Code', () => {
  it('maps every tone to its text role', () => {
    const expected: Record<TextTone, string> = {
      default: 'text-fg',
      muted: 'text-fg-muted',
      subtle: 'text-fg-subtle',
      brand: 'text-brand',
      success: 'text-success',
      warning: 'text-warning',
      danger: 'text-danger',
      info: 'text-info',
      up: 'text-up',
      down: 'text-down',
      inherit: '',
    };
    expect(TEXT_TONE).toEqual(expected);
    const toned = (Object.keys(expected) as TextTone[]).filter((tone) => expected[tone]);
    for (const tone of toned) {
      render(<Text tone={tone}>x</Text>);
      expect(classes(first())).toContain(expected[tone]);
    }
  });

  it('sets size with the whole font token', () => {
    render(<Text size="small">x</Text>);
    expect(classes(first())).toContain('[font:var(--t-small)]');
    render(<Text size="mono">x</Text>);
    expect(classes(first())).toContain('[font:var(--t-mono)]');
    expect(first().tagName).toBe('P');
  });

  it('Eyebrow is the muted uppercase label', () => {
    render(<Eyebrow>Revenue</Eyebrow>);
    expect(classes(first())).toEqual(
      expect.arrayContaining(['uppercase', 'text-fg-muted', '[font:var(--t-label)]']),
    );
  });

  it('Num has tabular figures, optionally mono and toned', () => {
    render(
      <Num mono tone="up">
        +4.2%
      </Num>,
    );
    expect(classes(first())).toEqual(
      expect.arrayContaining(['tabular-nums', 'font-mono', 'text-up']),
    );
  });

  it('Code is inline by default and a focusable block on request', () => {
    render(<Code>npm test</Code>);
    expect(first().tagName).toBe('CODE');
    render(<Code block>npm test</Code>);
    expect(first().tagName).toBe('PRE');
    expect(first().tabIndex).toBe(0);
  });
});

describe('Card variants', () => {
  it.each([
    ['surface', 'bg-surface'],
    ['raised', 'bg-raised'],
    ['sunken', 'bg-sunken'],
    ['outline', 'border-border-strong'],
  ] as const)('%s uses %s', (variant, cls) => {
    render(<Card variant={variant} />);
    expect(first().classList.contains('ui-card')).toBe(true);
    expect(first().classList.contains(cls)).toBe(true);
    expect(first().getAttribute('data-variant')).toBe(variant);
  });

  it('pads by the scale and Panel pads and spaces itself', () => {
    render(<Card padding="lg" />);
    expect(classes(first())).toContain('p-6');
    render(<Panel gap={3} />);
    expect(classes(first())).toEqual(
      expect.arrayContaining(['p-4', 'flex', 'flex-col', 'gap-3', 'ui-panel']),
    );
  });

  it('keeps the old default: a surface with no padding of its own', () => {
    render(<Card />);
    expect(classes(first())).toEqual(expect.arrayContaining(['bg-surface', 'border-border']));
    expect(classes(first()).some((c) => /^p-\d/.test(c))).toBe(false);
  });
});

function Page() {
  return (
    <main>
      <Stack gap={6}>
        <Stack gap={1}>
          <Eyebrow>Overview</Eyebrow>
          <Heading level={1}>Dashboard</Heading>
          <Text tone="muted">
            Revenue{' '}
            <Num mono tone="up">
              +4.2%
            </Num>{' '}
            against <Code>last month</Code>.
          </Text>
        </Stack>
        <Grid cols={{ base: 1, md: 3 }}>
          <Panel>
            <Eyebrow>Revenue</Eyebrow>
            <Num mono>£12,400</Num>
          </Panel>
          <Panel variant="raised">
            <Text size="small">Raised</Text>
          </Panel>
          <GridItem>
            <Card variant="outline">
              <CardHeader>
                <CardTitle as="h2">Outline</CardTitle>
              </CardHeader>
              <CardContent>Body</CardContent>
            </Card>
          </GridItem>
        </Grid>
        <PageGrid layout="2-1">
          <Section title="Orders" description="Latest" actions={<Button size="sm">Export</Button>}>
            <Card variant="sunken" padding="md">
              <Text>Content</Text>
            </Card>
          </Section>
          <Section title="Notes" level={2}>
            <Cluster>
              <Text>Left</Text>
              <Spacer />
              <Text tone="danger">Right</Text>
            </Cluster>
          </Section>
        </PageGrid>
      </Stack>
    </main>
  );
}

describe('axe: a composed page, every skin and mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(<Page />);
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
});
