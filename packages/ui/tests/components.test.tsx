// @vitest-environment jsdom
/* Behaviour the axe gate cannot see: what each a11y fix promises, the theme
   hook's attributes and storage, and the section registry's matching. */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Textarea } from '../src/components/input';
import { Skeleton, SkeletonTable, SkeletonText } from '../src/components/skeleton';
import { clearMaterialMaps } from '../src/glass';
import {
  Badge,
  Button,
  type ButtonVariant,
  buttonAttrs,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  ErrorBoundary,
  Icon,
  Input,
  Label,
  matchSection,
  NativeSelect,
  PanelHeader,
  type SectionDef,
  SectionNav,
  Separator,
  StatTile,
  useTheme,
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
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-skin');
});

function render(node: ReactNode) {
  act(() => root.render(node));
  return host;
}

function Boom(): never {
  throw new Error('kaput');
}

function Probe() {
  const t = useTheme();
  return (
    <>
      <button type="button" id="toggle" onClick={t.toggleTheme}>
        Toggle
      </button>
      <button type="button" id="glass" onClick={() => t.setSkin('glass')}>
        Glass
      </button>
    </>
  );
}

const SECTIONS: SectionDef[] = [
  { id: 'home', title: 'Home', href: '#/', icon: 'home' },
  { id: 'table', title: 'Table', href: '#/table' },
  { id: 'tables-admin', title: 'Admin', href: '#/table/admin' },
];

describe('StatTile', () => {
  it('names the direction in text, not colour alone', () => {
    const el = render(<StatTile label="CAGR" value="+12%" direction="up" />);
    expect(el.querySelector('.ui-sr-only')?.textContent).toBe('up, ');
    expect(el.querySelector('.ui-stat-arrow')?.getAttribute('aria-hidden')).toBe('true');
  });
  it('adds nothing for a neutral figure', () => {
    const el = render(<StatTile label="Sharpe" value="1.3" />);
    expect(el.querySelector('.ui-sr-only')).toBeNull();
  });
});

describe('PanelHeader', () => {
  it('renders its title as a heading at the given level', () => {
    const el = render(<PanelHeader title="Parameters" level={3} />);
    expect(el.querySelector('h3')?.textContent).toBe('Parameters');
  });
});

describe('Checkbox', () => {
  it('sets the mixed state as a DOM property', () => {
    const el = render(<Checkbox label="All" indeterminate />);
    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.indeterminate).toBe(true);
    expect(el.querySelector('label')?.contains(input)).toBe(true);
  });
});

describe('Separator', () => {
  it('is hidden from assistive tech unless it is meaningful', () => {
    expect(render(<Separator />).firstElementChild?.getAttribute('role')).toBe('none');
    expect(render(<Separator decorative={false} />).firstElementChild?.getAttribute('role')).toBe(
      'separator',
    );
  });
});

describe('Icon', () => {
  it('is decorative by default and an image when labelled', () => {
    expect(
      render(<Icon name="sun" />)
        .querySelector('svg')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');
    const svg = render(<Icon name="sun" label="Light" />).querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Light');
  });
});

describe('ErrorBoundary', () => {
  it('shows an alert card when a child throws', () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      const el = render(
        <ErrorBoundary name="Chart">
          <Boom />
        </ErrorBoundary>,
      );
      expect(el.querySelector('[role="alert"]')?.textContent).toContain('Chart couldn’t render');
    } finally {
      console.error = quiet;
    }
  });
});

describe('SectionNav + matchSection', () => {
  it('marks only the current link with aria-current', () => {
    const el = render(<SectionNav sections={SECTIONS} current="table" label="Main" />);
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Main');
    const current = el.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe('Table');
  });
  it('matches the longest prefix and falls back to home', () => {
    expect(matchSection(SECTIONS, '#/table/admin/users').id).toBe('tables-admin');
    expect(matchSection(SECTIONS, '#/table').id).toBe('table');
    expect(matchSection(SECTIONS, '#/nowhere').id).toBe('home');
    expect(() => matchSection([SECTIONS[1] as SectionDef], '#/x')).toThrow(/no home/);
  });
});

describe('useTheme', () => {
  it('writes data-theme and data-skin on <html> and remembers them', () => {
    localStorage.setItem('ui-theme', 'dark');
    render(<Probe />);
    const html = document.documentElement;
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(html.getAttribute('data-skin')).toBe('enterprise');

    act(() => (host.querySelector('#toggle') as HTMLButtonElement).click());
    act(() => (host.querySelector('#glass') as HTMLButtonElement).click());
    expect(html.getAttribute('data-theme')).toBe('light');
    expect(html.getAttribute('data-skin')).toBe('glass');
    expect(localStorage.getItem('ui-theme')).toBe('light');
    expect(localStorage.getItem('ui-skin')).toBe('glass');
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem('ui-skin', 'neon');
    render(<Probe />);
    expect(document.documentElement.getAttribute('data-skin')).toBe('enterprise');
  });
});

const VARIANTS: ButtonVariant[] = [
  'primary',
  'secondary',
  'neutral',
  'outline',
  'ghost',
  'link',
  'danger',
  'success',
];

describe('Button', () => {
  it('renders every level and size as a type="button" with its hooks', () => {
    const el = render(
      <>
        {VARIANTS.map((v) => (
          <Button key={v} variant={v}>
            {v}
          </Button>
        ))}
        <Button size="icon" aria-label="Add">
          +
        </Button>
      </>,
    );
    const buttons = Array.from(el.querySelectorAll('button'));
    expect(buttons.map((b) => b.dataset.variant)).toEqual([...VARIANTS, 'primary']);
    for (const b of buttons) {
      expect(b.classList.contains('ui-button')).toBe(true);
      expect(b.type).toBe('button');
    }
    expect(buttons[0]?.className).toContain('bg-primary');
    expect(buttons[6]?.className).toContain('bg-danger-solid');
    expect(buttons[8]?.dataset.size).toBe('icon');
    expect(buttons[8]?.className).toContain('size-9');
  });

  it('forwards its ref and lets a className override a variant class', () => {
    let node: HTMLButtonElement | null = null;
    const el = render(
      <Button
        ref={(n) => {
          node = n;
        }}
        className="px-8"
      >
        Go
      </Button>,
    );
    const button = el.querySelector('button');
    expect(node).toBe(button);
    expect(button?.className).toContain('px-8');
    expect(button?.className).not.toMatch(/(^| )px-3( |$)/);
  });

  it('gives an <a> the same look through buttonAttrs', () => {
    const attrs = buttonAttrs('secondary', 'lg');
    expect(attrs['data-variant']).toBe('secondary');
    expect(attrs['data-size']).toBe('lg');
    expect(attrs.className).toContain('ui-button');
    expect(attrs.className).toContain('text-on-secondary');
  });
});

describe('Badge', () => {
  it('renders each variant with its hook and its status roles', () => {
    const el = render(
      <>
        <Badge>Default</Badge>
        <Badge variant="up">Long</Badge>
        <Badge variant="solid">New</Badge>
      </>,
    );
    const badges = Array.from(el.querySelectorAll('.ui-badge'));
    expect(badges.map((b) => b.getAttribute('data-variant'))).toEqual(['neutral', 'up', 'solid']);
    expect(badges[0]?.className).toContain('text-fg-muted');
    expect(badges[1]?.className).toContain('text-up');
    expect(badges[1]?.className).toContain('bg-up-soft');
    expect(badges[2]?.className).toContain('bg-primary');
    expect(badges[2]?.className).toContain('text-on-primary');
  });
});

describe('Card', () => {
  it('is a Liquid Glass surface whose title fits the page outline', () => {
    const el = render(
      <Card className="extra">
        <CardHeader>
          <CardTitle as="h2">Settings</CardTitle>
          <CardDescription>Fields</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Foot</CardFooter>
      </Card>,
    );
    const card = el.firstElementChild as HTMLElement;
    expect(card.classList.contains('ui-card')).toBe(true);
    expect(card.classList.contains('ui-lg')).toBe(true);
    expect(card.classList.contains('extra')).toBe(true);
    expect(card.getAttribute('data-lg')).toBe('plain');
    expect(el.querySelector('h2.ui-card-title')?.textContent).toBe('Settings');
  });

  it('turns to glass in the glass skin', () => {
    document.documentElement.setAttribute('data-skin', 'glass');
    const el = render(<Card>Body</Card>);
    expect(el.firstElementChild?.getAttribute('data-lg')).not.toBe('plain');
  });
});

describe('Input, Textarea, Label and NativeSelect', () => {
  it('label their control and keep the ui- hooks', () => {
    const el = render(
      <>
        <Label htmlFor="n">Name</Label>
        <Input id="n" />
        <Textarea id="t" aria-label="Notes" />
        <NativeSelect id="s" aria-label="Database">
          <option>pg</option>
        </NativeSelect>
      </>,
    );
    const input = el.querySelector('input');
    expect(input?.type).toBe('text');
    expect(input?.classList.contains('ui-input')).toBe(true);
    expect(el.querySelector('label')?.htmlFor).toBe('n');
    expect(el.querySelector('textarea')?.classList.contains('ui-input')).toBe(true);
    expect(el.querySelector('select')?.classList.contains('ui-select')).toBe(true);
    // the glass material: the rim in glass, and NO backdrop filter (a control sits in content
    // that scrolls: ENGINEERING.md §5)
    expect(input?.className).not.toMatch(/glass-blur|glass-chrome|backdrop-filter/);
    expect(input?.className).toContain('glass:[--field-shadow:var(--elev-0)]');
  });
});

describe('Checkbox (more)', () => {
  it('clears the mixed state and stays a native checkbox without a label', () => {
    const el = render(<Checkbox aria-label="Row" indeterminate />);
    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('checkbox');
    expect(input.classList.contains('ui-checkbox')).toBe(true);
    expect(input.indeterminate).toBe(true);
    render(<Checkbox aria-label="Row" />);
    expect((el.querySelector('input') as HTMLInputElement).indeterminate).toBe(false);
  });
});

describe('Dialog', () => {
  it('wires its title and description and is glass in the glass skin', () => {
    document.documentElement.setAttribute('data-skin', 'glass');
    const el = render(
      <Dialog open={false} onClose={() => {}} title="Delete?" description="It cannot be undone.">
        Body
      </Dialog>,
    );
    const dialog = el.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.classList.contains('ui-dialog')).toBe(true);
    expect(dialog.getAttribute('data-lg')).not.toBe('plain');
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');
    expect(title?.textContent).toBe('Delete?');
    const desc = document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
    expect(desc?.textContent).toBe('It cannot be undone.');
    expect(dialog.querySelector('button[aria-label="Close"]')).not.toBeNull();
  });
});

describe('Separator (vertical)', () => {
  it('names its orientation when meaningful', () => {
    const sep = render(<Separator orientation="vertical" decorative={false} />).firstElementChild;
    expect(sep?.getAttribute('aria-orientation')).toBe('vertical');
    expect(sep?.getAttribute('data-orientation')).toBe('vertical');
    expect(sep?.classList.contains('ui-separator')).toBe(true);
  });
});

describe('SectionNav (routing)', () => {
  it('hands a plain left click to onNavigate', () => {
    const seen: string[] = [];
    const el = render(
      <SectionNav sections={SECTIONS} current="home" onNavigate={(s) => seen.push(s.id)} />,
    );
    const link = el.querySelectorAll('a')[1] as HTMLAnchorElement;
    act(() => link.click());
    expect(seen).toEqual(['table']);
    expect(link.classList.contains('ui-nav-link')).toBe(true);
  });
});

describe('Skeleton', () => {
  it('is a decorative shape with no role, sized by width and height', () => {
    const el = render(<Skeleton width={120} height="2rem" radius="circle" className="x" />);
    const s = el.firstElementChild as HTMLElement;
    expect(s.getAttribute('aria-hidden')).toBe('true');
    expect(s.hasAttribute('role')).toBe(false);
    expect(s.hasAttribute('aria-busy')).toBe(false);
    expect(s.style.width).toBe('120px');
    expect(s.style.height).toBe('2rem');
    expect(s.className).toContain('rounded-full');
    expect(s.className).toContain('x');
    // the shimmer stops under reduced motion; glass material in the glass skin
    expect(s.className).toContain('motion-reduce:after:hidden');
    expect(s.className).toContain('after:via-(--shine)');
  });

  it('defaults to a full-width md rectangle', () => {
    const s = render(<Skeleton />).firstElementChild as HTMLElement;
    expect(s.getAttribute('data-radius')).toBe('md');
    expect(s.className).toContain('rounded-md');
    expect(s.style.width).toBe('');
  });

  it('SkeletonText draws `lines` lines with a shorter last line', () => {
    const el = render(<SkeletonText lines={4} />);
    const wrap = el.firstElementChild as HTMLElement;
    expect(wrap.getAttribute('aria-hidden')).toBe('true');
    const lines = Array.from(wrap.querySelectorAll<HTMLElement>('.ui-skeleton'));
    expect(lines).toHaveLength(4);
    expect(lines.slice(0, 3).map((l) => l.style.width)).toEqual(['100%', '100%', '100%']);
    expect(lines[3]?.style.width).toBe('60%');
  });

  it('SkeletonTable draws a header row and rows x columns cells', () => {
    const el = render(<SkeletonTable rows={3} columns={5} />);
    const table = el.firstElementChild as HTMLElement;
    expect(table.getAttribute('aria-hidden')).toBe('true');
    expect(table.style.gridTemplateColumns).toBe('repeat(5, minmax(0, 1fr))');
    expect(table.querySelectorAll('.ui-skeleton')).toHaveLength(5 * 4);
    expect(table.children[5]?.className).toContain('py-[9px]');
  });
});
