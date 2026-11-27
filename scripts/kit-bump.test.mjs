import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { bumpApp, exportClashes, releaseFacts, rewritePins, tarballUrl } from './kit-bump.mjs';

const RELEASES = new URL('../releases/', import.meta.url).pathname;

test('rewritePins moves both packages and reports the old versions', () => {
  const { text, from } = rewritePins(
    `"${tarballUrl('ui', '1.0.2')}" "${tarballUrl('colors', '1.0.2')}" "other.tgz"`,
    '1.0.5',
  );
  assert.deepEqual(from, ['1.0.2']);
  assert.equal(
    text,
    `"${tarballUrl('ui', '1.0.5')}" "${tarballUrl('colors', '1.0.5')}" "other.tgz"`,
  );
});

test('bumpApp rewrites manifests and the lockfile from the release tarballs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-bump-test-'));
  try {
    const old = {
      ui: releaseFacts(RELEASES, 'ui', '1.0.4'),
      colors: releaseFacts(RELEASES, 'colors', '1.0.4'),
    };
    const deps = {
      '@apps/colors': tarballUrl('colors', '1.0.4'),
      '@apps/ui': tarballUrl('ui', '1.0.4'),
    };
    writeFileSync(
      join(dir, 'package.json'),
      `${JSON.stringify({ name: 'app', dependencies: deps }, null, 2)}\n`,
    );
    mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules', 'x', 'package.json'),
      JSON.stringify({ dependencies: deps }),
    );
    const lock = {
      name: 'app',
      lockfileVersion: 3,
      packages: {
        '': { name: 'app', dependencies: deps },
        'node_modules/@apps/colors': {
          version: '1.0.4',
          resolved: tarballUrl('colors', '1.0.4'),
          integrity: old.colors.integrity,
          license: old.colors.license,
        },
        'node_modules/@apps/ui': {
          version: '1.0.4',
          resolved: tarballUrl('ui', '1.0.4'),
          integrity: old.ui.integrity,
          license: old.ui.license,
          dependencies: old.ui.dependencies,
          peerDependencies: old.ui.peerDependencies,
        },
      },
    };
    writeFileSync(join(dir, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);

    const report = bumpApp(dir, '1.0.5', RELEASES);
    assert.deepEqual(report.from, ['1.0.4']);
    assert.deepEqual(report.files.toSorted(), ['package-lock.json', 'package.json']);
    assert.equal(report.needsInstall, false);

    const fresh = releaseFacts(RELEASES, 'ui', '1.0.5');
    const after = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
    assert.equal(after.packages['node_modules/@apps/ui'].version, '1.0.5');
    assert.equal(after.packages['node_modules/@apps/ui'].integrity, fresh.integrity);
    assert.equal(
      after.packages['node_modules/@apps/ui'].dependencies['@apps/colors'],
      tarballUrl('colors', '1.0.5'),
    );
    assert.equal(after.packages[''].dependencies['@apps/ui'], tarballUrl('ui', '1.0.5'));
    // node_modules is never touched.
    assert.match(readFileSync(join(dir, 'node_modules', 'x', 'package.json'), 'utf8'), /1\.0\.4/);
    // A second run changes nothing.
    assert.deepEqual(bumpApp(dir, '1.0.5', RELEASES).files, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an app without the kit is left alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-bump-test-'));
  try {
    writeFileSync(join(dir, 'package.json'), '{"name":"plain"}\n');
    const report = bumpApp(dir, '1.0.5', RELEASES);
    assert.deepEqual(report, {
      from: [],
      to: '1.0.5',
      files: [],
      lockfiles: [],
      needsInstall: false,
      clashes: [],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a new kit export that the app also star-exports is reported as a clash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-bump-test-'));
  try {
    const deps = {
      '@apps/colors': tarballUrl('colors', '1.0.5'),
      '@apps/ui': tarballUrl('ui', '1.0.5'),
    };
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', dependencies: deps }));
    mkdirSync(join(dir, 'src', 'ui'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'ui', 'index.ts'),
      "export * from '@apps/ui';\nexport * from './own';\n",
    );
    writeFileSync(
      join(dir, 'src', 'ui', 'own.tsx'),
      'export function PointerPredict() {}\nexport const Unrelated = 1;\n',
    );
    const report = bumpApp(dir, '1.0.6', RELEASES);
    assert.deepEqual(report.clashes, ['PointerPredict']);
    assert.deepEqual(exportClashes(dir, RELEASES, ['1.0.6'], '1.0.6'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
