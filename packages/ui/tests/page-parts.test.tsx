// @vitest-environment jsdom
/* The pieces the base-app pages needed once they stopped writing CSS: Notice, PasswordInput,
   ChoiceCard (+ SkinPreview, BackdropSwatch), Show, AppRoot, PageEnter, ShaderHero, and the
   additions to Text (weight, display, preserveLines) and the effect cards (surface). Each gets
   its semantics and behaviour checked; then they go through axe in every skin and mode. */
import axe from 'axe-core';
import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearMaterialMaps } from '../src/glass';
import {
  AppRoot,
  BackdropSwatch,
  ChoiceCard,
  FormField,
  Notice,
  PageEnter,
  PasswordInput,
  PointerLight,
  ShaderHero,
  Show,
  SkinPreview,
  Text,
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

const render = (node: ReactNode) => act(() => root.render(node));
const $ = <E extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as E;
const click = (el: Element) => act(() => (el as HTMLElement).click());

describe('Notice', () => {
  it('announces danger and warning at once, and info and success politely', () => {
    render(
      <>
        <Notice tone="danger">Bad</Notice>
        <Notice tone="warning">Careful</Notice>
        <Notice tone="info">FYI</Notice>
        <Notice tone="success">Done</Notice>
      </>,
    );
    const roles = Array.from(host.querySelectorAll('.ui-notice'), (n) => n.getAttribute('role'));
    expect(roles).toEqual(['alert', 'alert', 'status', 'status']);
  });

  it('shows a title, takes a ref-able focus target and carries an icon with the words', () => {
    render(
      <Notice tone="danger" title="Check the following" tabIndex={-1}>
        Enter your password.
      </Notice>,
    );
    const n = $('.ui-notice');
    expect(n.textContent).toBe('Check the followingEnter your password.');
    expect(n.getAttribute('tabindex')).toBe('-1');
    expect(n.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('PasswordInput', () => {
  it('toggles the field type with a named, pressed button that keeps the value', () => {
    render(<PasswordInput aria-label="Password" defaultValue="secret" />);
    const input = $<HTMLInputElement>('input');
    const toggle = $<HTMLButtonElement>('button');
    expect(input.type).toBe('password');
    expect(toggle.getAttribute('aria-label')).toBe('Show password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.focus();
    click(toggle);
    expect(input.type).toBe('text');
    expect(input.value).toBe('secret');
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(toggle);
  });

  it('is wired by a FormField (id, label, error)', () => {
    render(
      <FormField label="Password" error="Enter your password.">
        <PasswordInput />
      </FormField>,
    );
    const input = $<HTMLInputElement>('input');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector(`label[for="${input.id}"]`)?.textContent).toBe('Password');
    expect(input.getAttribute('aria-describedby')).toContain('-err');
  });
});

describe('ChoiceCard', () => {
  function Group() {
    const [v, setV] = useState('a');
    return (
      <div role="radiogroup" aria-label="Skin">
        {['a', 'b'].map((x) => (
          <ChoiceCard
            key={x}
            name="skin"
            value={x}
            checked={v === x}
            onSelect={setV}
            label={`Option ${x}`}
            description="About it"
            preview={<SkinPreview skin={x === 'a' ? 'enterprise' : 'glass'} />}
          />
        ))}
      </div>
    );
  }

  it('is a native radio over the whole card, with a check and a heavier look when chosen', () => {
    render(<Group />);
    const radios = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios.map((r) => r.checked)).toEqual([true, false]);
    expect(radios[0]?.name).toBe('skin');
    const cards = Array.from(host.querySelectorAll('.ui-choice-card'));
    expect(cards[0]?.hasAttribute('data-checked')).toBe(true);
    expect(cards[0]?.querySelector('svg')).not.toBeNull();
    expect(cards[1]?.querySelector('svg')).toBeNull();
    click(radios[1] as HTMLInputElement);
    expect(radios.map((r) => r.checked)).toEqual([false, true]);
  });

  it('hides the picture from assistive tech', () => {
    render(
      <ChoiceCard
        name="b"
        value="tide"
        checked={false}
        onSelect={() => {}}
        label="Tide"
        preview={<BackdropSwatch backdrop="tide" />}
      />,
    );
    expect($('.ui-backdrop-swatch').closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('layout and shell bits', () => {
  it('Show hides below or above a width by class, and takes no space of its own', () => {
    render(
      <>
        <Show from="lg">a</Show>
        <Show below="sm">b</Show>
      </>,
    );
    const [a, b] = Array.from(host.querySelectorAll('.ui-show'));
    expect(a?.className).toContain('hidden');
    expect(a?.className).toContain('lg:contents');
    expect(b?.className).toContain('contents');
    expect(b?.className).toContain('sm:hidden');
  });

  it('AppRoot is the .ui-app root and PageEnter the entrance wrapper', () => {
    render(
      <AppRoot>
        <PageEnter>page</PageEnter>
      </AppRoot>,
    );
    expect($('.ui-app .ui-page-enter').textContent).toBe('page');
  });

  it('ShaderHero draws a centred host, with the accent only while active', () => {
    render(<ShaderHero active={false}>Hero</ShaderHero>);
    expect($('.ui-shader-host').textContent).toBe('Hero');
    expect(host.querySelector('.ui-shader-accent')).toBeNull();
    render(<ShaderHero active>Hero</ShaderHero>);
    expect(host.querySelector('.ui-shader-accent')).not.toBeNull();
  });
});

describe('Text and effect additions', () => {
  it('Text takes a weight, a display size and preserves lines on request', () => {
    render(
      <>
        <Text weight="semibold">a</Text>
        <Text size="display">1,234</Text>
        <Text preserveLines>b</Text>
      </>,
    );
    const [w, d, p] = Array.from(host.querySelectorAll('.ui-text'));
    expect(w?.className).toContain('font-semibold');
    expect(d?.className).toContain('tabular-nums');
    expect(p?.className).toContain('whitespace-pre-wrap');
  });

  it('PointerLight draws its own surface when asked', () => {
    render(<PointerLight surface>a</PointerLight>);
    for (const el of Array.from(host.children)) {
      expect(el.className).toContain('bg-surface');
      expect(el.className).toContain('ui-card');
    }
  });
});

function Composed() {
  return (
    <AppRoot>
      <main id="main">
        <h1>Composed</h1>
        <Notice tone="danger" title="Check the following">
          Enter your password.
        </Notice>
        <FormField label="Password" error="Enter your password.">
          <PasswordInput />
        </FormField>
        <div role="radiogroup" aria-label="Skin">
          <ChoiceCard
            name="skin"
            value="enterprise"
            checked
            onSelect={() => {}}
            label="Enterprise"
            description="Calm"
            preview={<SkinPreview skin="enterprise" />}
          />
          <ChoiceCard
            name="skin"
            value="glass"
            checked={false}
            onSelect={() => {}}
            label="Glass"
            preview={<SkinPreview skin="glass" />}
          />
        </div>
        <ChoiceCard
          name="bd"
          value="mesh"
          checked={false}
          onSelect={() => {}}
          label="Mesh"
          preview={<BackdropSwatch backdrop="mesh" />}
        />
        <ShaderHero active={false}>
          <Text>Hero</Text>
        </ShaderHero>
      </main>
    </AppRoot>
  );
}

describe('axe: the new parts, every skin and mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(<Composed />);
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
