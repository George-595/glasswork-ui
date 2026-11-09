/* shared/ is the wire contract and must stay type-only: no imports, and no
   runtime export (no const, function, class or enum) that would pull code
   across the client/server line. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(import.meta.dirname, '..', 'shared');
const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

describe('shared/ is type-only', () => {
  it('has files to check', () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    it(`${f} imports nothing`, () => expect(src).not.toMatch(/^\s*import\s/m));
    it(`${f} exports only types`, () => {
      expect(src).not.toMatch(/^\s*export\s+(const|let|var|function|class|enum|default|async)\b/m);
      expect(src).not.toMatch(/^\s*export\s*\{/m);
    });
  }
});
