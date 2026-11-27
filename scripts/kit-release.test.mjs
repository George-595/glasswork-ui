// kit-release: the manifest an app installs is installable, script-free and points at its releases.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseManifest, url } from './kit-release.mjs';

test('release manifest', () => {
  const out = releaseManifest(
    {
      name: '@apps/ui',
      private: true,
      version: '0.0.0',
      scripts: { prepare: 'x' },
      devDependencies: { tailwindcss: '4.3.5' },
      dependencies: { '@apps/colors': '1.0.0', clsx: '2.1.1' },
    },
    '1.2.3',
  );
  assert.equal(out.version, '1.2.3');
  assert.equal(out.private, undefined);
  assert.equal(out.scripts, undefined);
  assert.equal(out.devDependencies, undefined);
  assert.equal(out.dependencies.clsx, '2.1.1');
  assert.equal(
    out.dependencies['@apps/colors'],
    'https://raw.githubusercontent.com/George-595/glasswork-ui/main/releases/apps-colors-1.2.3.tgz',
  );
  assert.equal(url('ui', '1.2.3').endsWith('/releases/apps-ui-1.2.3.tgz'), true);
});
