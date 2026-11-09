// Tests for check-craft.mjs: `node --test scripts/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanSource } from './check-craft.mjs';

const cats = (text, kind = 'jsx') => scanSource(text, kind).map((f) => f.cat);

test('motion habits in CSS', () => {
  assert.deepEqual(cats('a { transition: all 0.2s; }', 'css'), ['transition-all']);
  assert.deepEqual(cats('a { transition-timing-function: ease-in; }', 'css'), ['ease-in']);
  assert.deepEqual(cats('a { transform: scale(0); }', 'css'), ['scale-zero']);
  assert.deepEqual(cats('a { min-height: 100vh; }', 'css'), ['vh']);
});

test('motion habits in class strings', () => {
  assert.deepEqual(cats("const c = 'transition-all duration-200';"), ['transition-all']);
  assert.deepEqual(cats('<div className="h-screen ease-in" />'), ['ease-in', 'vh']);
  assert.deepEqual(cats("cn('min-h-screen', 'scale-0')"), ['scale-zero', 'vh']);
});

test('the good versions pass', () => {
  assert.deepEqual(cats('a { transition: opacity 0.2s ease-out; min-height: 100dvh; }', 'css'), []);
  assert.deepEqual(
    cats("cn('ease-in-out transition-[scale] scale-95 h-dvh min-h-svh scale-100')"),
    [],
  );
  assert.deepEqual(cats('const unit = scale > 0 ? width / scale : 0;', 'js'), []);
});

test('craft-ok marks a deliberate exception on the line or the line above', () => {
  assert.deepEqual(cats("// craft-ok: a tick grows from its centre\nconst c = 'scale-0';"), []);
  assert.deepEqual(cats("const c = 'scale-0'; // craft-ok: tick"), []);
  assert.deepEqual(cats("// craft-ok: tick\n\nconst c = 'scale-0';"), ['scale-zero']);
});

test('stock copy in strings and JSX text, not identifiers or comments', () => {
  assert.deepEqual(cats('<p>Unlock seamless insights</p>'), ['stock-copy']);
  assert.deepEqual(cats("const t = 'An all-in-one workspace';", 'js'), ['stock-copy']);
  assert.deepEqual(
    cats('// repeat the first colour so the loop is seamless\nconst a = 1;', 'js'),
    [],
  );
  assert.deepEqual(cats('const unlocked = elevated(true);', 'js'), []);
});

test('vague labels, but not attribute values', () => {
  assert.deepEqual(cats('<Button>Learn more</Button>'), ['vague-label']);
  assert.deepEqual(cats('<Button label="Get started" />'), ['vague-label']);
  assert.deepEqual(cats('<Button type="submit">Save changes</Button>'), []);
  assert.deepEqual(cats('<p>Read more about it in the guide</p>'), []);
});
