// @vitest-environment jsdom
/* Controls on the role model: each Button level renders its own roles, the pressed /
   selected / disabled / loading semantics, the old names as aliases, Toggle, Badge,
   and an axe pass over the whole controls matrix in every skin x mode. */
import axe from 'axe-core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadgeMatrix, ButtonMatrix, InputStates, ToggleStates } from '../fixture/ControlsMatrix';
import {
  Badge,
  BUTTON_LEVELS,
  Button,
  type ButtonLevel,
  buttonAttrs,
  resolveButtonLevel,
  Toggle,
  ToggleGroup,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const render = (ui: React.ReactNode) => {
  act(() => root.render(ui));
  return host;
};
const btn = () => host.querySelector('button') as HTMLButtonElement;
const has = (el: Element, ...cls: string[]) => {
  const list = el.className.split(/\s+/);
  return cls.filter((c) => !list.includes(c));
};

const ROLES: Record<ButtonLevel, { bg: string; fg: string; hover: string; active: string }> = {
  primary: {
    bg: 'bg-primary',
    fg: 'text-on-primary',
    hover: 'hover:bg-primary-hover',
    active: 'active:bg-primary-active',
  },
  secondary: {
    bg: 'bg-secondary',
    fg: 'text-on-secondary',
    hover: 'hover:bg-secondary-hover',
    active: 'active:bg-secondary-active',
  },
  neutral: {
    bg: 'bg-neutral',
    fg: 'text-on-neutral',
    hover: 'hover:bg-neutral-hover',
    active: 'active:bg-neutral-active',
  },
  outline: {
    bg: 'bg-transparent',
    fg: 'text-on-outline',
    hover: 'hover:bg-outline-hover',
    active: 'active:bg-outline-active',
  },
  ghost: {
    bg: 'bg-transparent',
    fg: 'text-on-ghost',
    hover: 'hover:bg-ghost-hover',
    active: 'active:bg-ghost-active',
  },
  link: {
    bg: 'bg-transparent',
    fg: 'text-link',
    hover: 'hover:text-link-hover',
    active: 'active:text-link-hover',
  },
  danger: {
    bg: 'bg-danger-solid',
    fg: 'text-on-danger',
    hover: 'hover:bg-danger-solid-hover',
    active: 'active:bg-danger-solid-active',
  },
  success: {
    bg: 'bg-success-solid',
    fg: 'text-on-success',
    hover: 'hover:bg-success-solid-hover',
    active: 'active:bg-success-solid-active',
  },
};

describe('Button levels', () => {
  for (const level of BUTTON_LEVELS) {
    it(`${level} uses its own roles`, () => {
      render(<Button variant={level}>x</Button>);
      const r = ROLES[level];
      expect(has(btn(), r.bg, r.fg, r.hover, r.active)).toEqual([]);
      expect(btn().dataset.variant).toBe(level);
    });
  }

  it('has exactly the eight levels of ENGINEERING §5', () => {
    expect([...BUTTON_LEVELS]).toEqual([
      'primary',
      'secondary',
      'neutral',
      'outline',
      'ghost',
      'link',
      'danger',
      'success',
    ]);
  });

  it('pressed (aria-pressed) takes the -active role and the inset elevation', () => {
    render(
      <Button variant="primary" aria-pressed="true">
        x
      </Button>,
    );
    expect(btn().getAttribute('aria-pressed')).toBe('true');
    expect(has(btn(), 'not-disabled:not-aria-disabled:aria-pressed:bg-primary-active')).toEqual([]);
    expect(btn().className).toContain('--elev-inset');
  });

  it('disabled and aria-disabled use the disabled roles, never opacity', () => {
    render(
      <>
        <Button disabled>a</Button>
        <Button aria-disabled="true">b</Button>
      </>,
    );
    for (const b of host.querySelectorAll('button')) {
      expect(
        has(
          b,
          'disabled:bg-disabled',
          'disabled:text-disabled-fg',
          'disabled:border-disabled-border',
        ),
      ).toEqual([]);
      expect(has(b, 'aria-disabled:bg-disabled', 'aria-disabled:text-disabled-fg')).toEqual([]);
      expect(b.className).not.toMatch(/opacity/);
    }
  });

  it('focus-visible draws the ring', () => {
    render(<Button>x</Button>);
    expect(has(btn(), 'focus-visible:[box-shadow:var(--ring)]')).toEqual([]);
  });

  it('loading: aria-busy, aria-disabled, spinner, label kept, clicks ignored', () => {
    const onClick = vi.fn<() => void>();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    expect(btn().getAttribute('aria-busy')).toBe('true');
    expect(btn().getAttribute('aria-disabled')).toBe('true');
    expect(btn().textContent).toBe('Save');
    expect(btn().querySelector('.ui-button-spinner')).not.toBeNull();
    act(() => btn().click());
    expect(onClick).not.toHaveBeenCalled();
  });

  it('a normal button still clicks', () => {
    const onClick = vi.fn<() => void>();
    render(<Button onClick={onClick}>Go</Button>);
    act(() => btn().click());
    expect(onClick).toHaveBeenCalledOnce();
    expect(btn().hasAttribute('aria-busy')).toBe(false);
  });

  it('sizes: sm 32, md 36, lg 40, icon a square', () => {
    render(
      <>
        <Button size="sm">a</Button>
        <Button size="md">b</Button>
        <Button size="lg">c</Button>
        <Button size="icon" aria-label="d" />
      </>,
    );
    const [sm, md, lg, icon] = Array.from(host.querySelectorAll('button'));
    expect(has(sm as Element, 'min-h-8')).toEqual([]);
    expect(has(md as Element, 'min-h-9')).toEqual([]);
    expect(has(lg as Element, 'min-h-10')).toEqual([]);
    expect(has(icon as Element, 'size-9')).toEqual([]);
  });

  it('old names are aliases of the new levels', () => {
    expect(resolveButtonLevel('destructive')).toBe('danger');
    expect(resolveButtonLevel('accent-outline')).toBe('secondary');
    render(<Button variant="destructive">x</Button>);
    expect(btn().dataset.variant).toBe('danger');
    expect(has(btn(), 'bg-danger-solid')).toEqual([]);
    expect(buttonAttrs('accent-outline')['data-variant']).toBe('secondary');
  });

  it('carries no colour literal or legacy plumbing', () => {
    render(
      BUTTON_LEVELS.map((l) => (
        <Button key={l} variant={l}>
          x
        </Button>
      )),
    );
    for (const b of host.querySelectorAll('button')) {
      expect(b.className).not.toMatch(
        /#[0-9a-f]{3,8}|rgb|hsl|color-mix|btn-fill|glass-tint|glass-chip|text-ink|bg-accent/,
      );
    }
  });
});

describe('Toggle', () => {
  it('is a pressable button with aria-pressed that flips on click', () => {
    const onPressedChange = vi.fn<() => void>();
    render(<Toggle onPressedChange={onPressedChange}>Bold</Toggle>);
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    act(() => btn().click());
    expect(btn().getAttribute('aria-pressed')).toBe('true');
    expect(btn().dataset.state).toBe('on');
    expect(onPressedChange).toHaveBeenCalledWith(true);
    expect(
      has(
        btn(),
        'data-[state=on]:bg-selected',
        'data-[state=on]:text-fg',
        'data-[state=on]:border-brand',
      ),
    ).toEqual([]);
  });

  it('ToggleGroup (multiple) presses items independently', () => {
    render(
      <ToggleGroup
        type="multiple"
        label="Cols"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );
    const [a, b] = Array.from(host.querySelectorAll('button'));
    act(() => (a as HTMLButtonElement).click());
    act(() => (b as HTMLButtonElement).click());
    expect(a?.getAttribute('aria-pressed')).toBe('true');
    expect(b?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Badge tones', () => {
  it('soft is the tone wash with the tone text; outline is a hairline', () => {
    render(
      <>
        <Badge variant="success">a</Badge>
        <Badge variant="danger" appearance="outline">
          b
        </Badge>
      </>,
    );
    const [soft, outline] = Array.from(host.querySelectorAll('.ui-badge'));
    expect(has(soft as Element, 'bg-success-soft', 'text-success')).toEqual([]);
    expect(has(outline as Element, 'border-danger', 'text-danger')).toEqual([]);
  });

  it('keeps old names as aliases', () => {
    render(
      <>
        <Badge variant="warn">w</Badge>
        <Badge variant="accent">a</Badge>
        <Badge>d</Badge>
      </>,
    );
    const [w, a, d] = Array.from(host.querySelectorAll('.ui-badge'));
    expect(has(w as Element, 'bg-warning-soft', 'text-warning')).toEqual([]);
    expect(has(a as Element, 'bg-brand-soft', 'text-brand')).toEqual([]);
    expect(has(d as Element, 'text-fg-muted')).toEqual([]);
  });
});

describe('axe: the controls matrix, every skin x mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(
          <main>
            <h1>Controls</h1>
            <ButtonMatrix />
            <BadgeMatrix />
            <ToggleStates />
            <InputStates />
          </main>,
        );
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
