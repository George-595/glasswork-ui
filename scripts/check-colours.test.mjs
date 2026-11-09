// Tests for check-colours.mjs and check-pages.mjs: `node --test scripts/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanText } from './check-colours.mjs';
import { scanPage, tokenAllowed } from './check-pages.mjs';

const cats = (text, file, opts) => scanText(text, file, opts).map((f) => f.cat);
const roles = new Set(['surface', 'fg', 'chart-1']);

test('hex colours in CSS values, strings and attributes', () => {
  assert.deepEqual(cats('a { color: #fff; }', 'a.css'), ['hex']);
  assert.deepEqual(cats('a{background:linear-gradient(#112233,#abc)}', 'a.css'), ['hex', 'hex']);
  assert.deepEqual(cats("const c = '#4F69D9';", 'a.ts'), ['hex']);
  assert.deepEqual(cats('<rect fill="#12345678" />', 'a.tsx'), ['hex']);
  assert.deepEqual(cats("el.style.border = '1px solid #333';", 'a.ts'), ['hex']);
});

test('hex look-alikes are not colours', () => {
  assert.deepEqual(cats('<a href="#add">x</a>', 'a.html'), []);
  assert.deepEqual(cats('#fee { margin: 0 }', 'a.css'), []);
  assert.deepEqual(cats('a { fill: url(#grad); }', 'a.css'), []);
  assert.deepEqual(cats("const t = 'Order #1042 shipped';", 'a.ts'), []);
  assert.deepEqual(cats('class A { #add = 1; }', 'a.ts'), []);
  assert.deepEqual(cats('&#123;', 'a.html'), []);
});

test('comments are ignored', () => {
  assert.deepEqual(cats('/* #fff red rgb(0 0 0) */ a { margin: 0 }', 'a.css'), []);
  assert.deepEqual(cats("// color: '#fff'\nconst a = 1; /* rgb(1,2,3) */", 'a.ts'), []);
  assert.deepEqual(cats('<!-- fill="red" --><p>hi</p>', 'a.html'), []);
});

test('colour functions', () => {
  for (const fn of [
    'rgb(0 0 0)',
    'rgba(0,0,0,.5)',
    'hsl(0 0% 0%)',
    'oklch(0.5 0.1 20)',
    'oklab(0 0 0)',
    'lab(0 0 0)',
    'lch(0 0 0)',
    'color(srgb 1 0 0)',
    'color-mix(in srgb, red, blue)',
  ])
    assert.ok(cats(`a { x: ${fn}; }`, 'a.css').includes('colour-fn'), fn);
  assert.deepEqual(cats("const s = 'rgba(0,0,0,.5)';", 'a.ts'), ['colour-fn']);
  assert.deepEqual(cats('a { color: var(--fg); }', 'a.css'), []);
});

test('named colours as values; keywords are fine', () => {
  assert.deepEqual(cats('a { color: white; }', 'a.css'), ['named']);
  assert.deepEqual(cats('a { border: 1px solid red; }', 'a.css'), ['named']);
  assert.deepEqual(
    cats('a { color: transparent; fill: currentColor; background: none; }', 'a.css'),
    [],
  );
  assert.deepEqual(
    cats('a { color: inherit; outline: initial; border-color: unset }', 'a.css'),
    [],
  );
  assert.deepEqual(cats('<circle fill="red" stroke="none" />', 'a.tsx'), ['named']);
  assert.deepEqual(cats("const s = { color: 'rebeccapurple' };", 'a.ts'), ['named']);
  assert.deepEqual(cats('<svg fill="white"></svg>', 'a.svg'), ['named']);
  assert.deepEqual(cats('<p style="color: tomato">x</p>', 'a.html'), ['named']);
  assert.deepEqual(cats('a { font-family: Gold, serif; }', 'a.css'), []);
});

test('Tailwind stock palette', () => {
  assert.deepEqual(cats('<p className="bg-red-500 text-white">', 'a.tsx'), [
    'tw-palette',
    'tw-palette',
  ]);
  assert.deepEqual(cats('<p className="hover:bg-slate-100 border-black/10">', 'a.tsx'), [
    'tw-palette',
    'tw-palette',
  ]);
  assert.deepEqual(
    cats('<p className="bg-surface text-fg-muted border-border-strong">', 'a.tsx'),
    [],
  );
  assert.deepEqual(cats('<p className="text-red-linkage">', 'a.tsx'), []);
});

test('role var(--x) inside a bracket', () => {
  assert.deepEqual(cats("cn('[--av:var(--chart-1)]')", 'a.tsx', { roles }), ['arbitrary']);
  assert.deepEqual(cats("cn('w-[var(--w)]')", 'a.tsx', { roles }), []);
});

test('legacy names are reported as legacy', () => {
  const l = scanText(
    "cn('text-ink border-edge bg-elevated text-muted-foreground') ; x = 'var(--accent)'; cssVar('ink')",
    'a.tsx',
  );
  assert.ok(l.length >= 5 && l.every((f) => f.legacy));
  const css = scanText(
    'a { background: var(--glass-tint-primary); --btn-fill: var(--fg); }',
    'a.css',
  );
  assert.ok(css.length >= 2 && css.every((f) => f.legacy));
  assert.deepEqual(scanText("cn('text-fg bg-surface border-border')", 'a.tsx'), []);
});

test('line numbers', () => {
  const [f] = scanText('a {\n  margin: 0;\n  color: #fff;\n}', 'a.css');
  assert.equal(f.line, 3);
});

test('template literals with nested expressions', () => {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is source text
  assert.deepEqual(cats('const s = `a ${x ? `b #fff` : "c"} d`;', 'a.ts'), ['hex']);
});

test('pages: allowlist', () => {
  for (const t of ['sr-only', 'col-span-2', 'md:col-span-3', 'lg:row-span-full'])
    assert.ok(tokenAllowed(t), t);
  for (const t of ['flex', 'p-4', 'text-sm', 'col-start-2', 'bg-surface'])
    assert.ok(!tokenAllowed(t), t);
});

test('pages: findings', () => {
  const f = scanPage(`export default () => (
  <Page>
    <Card className="col-span-2 md:col-span-3 sr-only" />
    <Card className="p-4" />
    <div className={cn('flex', open && 'w-[320px]')} />
    <span style={{ color: x }} />
    <p style="a" />
  </Page>
);`);
  const got = f.map((x) => `${x.line}:${x.cat}`).sort();
  assert.deepEqual(
    got,
    ['4:classname', '5:arbitrary', '5:raw-element', '6:inline-style', '7:inline-style'].sort(),
  );
  assert.deepEqual(scanPage('const a = <Stack gap="4"><Text>hi</Text></Stack>;'), []);
});
