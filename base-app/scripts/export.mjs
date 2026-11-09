// export — copy this app out of the workspace into a folder that builds on its own.
//
//   npm run export -- <dest>          # from base-app; <dest> must be new or empty
//
// <dest> gets this folder (minus node_modules, dist, .env and local databases),
// @apps/ui and @apps/colors (ui's colour source) copied to <dest>/vendor/ui and
// <dest>/vendor/colors (package.json's "workspaces": ["vendor/*"] makes both workspaces
// there, so the "@apps/ui" / "@apps/colors": "0.1.0" pins resolve to them),
// ENGINEERING.md, a .dockerignore, and the Dockerfile rewritten for a build
// context of <dest> instead of apps/. Then, in <dest>:
//
//   npm install && npm run verify && npm run build
//
// The first install writes <dest>/package-lock.json under the 7-day quarantine
// in .npmrc; commit it. README.md ("Take it to another repo") has the steps.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const apps = join(app, '..');
const arg = process.argv[2];
if (!arg) {
  console.error('usage: npm run export -- <dest>');
  process.exit(2);
}
const dest = resolve(arg);
const fail = (msg) => {
  console.error(`export: ${msg}`);
  process.exit(2);
};
if (
  !existsSync(join(apps, 'packages/ui/package.json')) ||
  !existsSync(join(apps, 'packages/colors/package.json')) ||
  !existsSync(join(apps, '.dockerignore'))
)
  fail(
    `${apps} is not the workspace root (no packages/ui or packages/colors); run export from base-app.`,
  );
if (existsSync(dest)) {
  if (!statSync(dest).isDirectory()) fail(`${dest} is a file; pick a new folder.`);
  if (readdirSync(dest).length > 0) fail(`${dest} is not empty; pick a new folder.`);
}
// outside apps/, symlinks resolved: the nearest existing ancestor of dest is what counts
let probe = dest;
while (!existsSync(probe)) probe = dirname(probe);
const rel = relative(realpathSync(apps), join(realpathSync(probe), relative(probe, dest)));
if (rel === '' || !(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)))
  fail(`${dest} is inside apps/; export to a folder outside it.`);

// package-lock.json too: the copy's first `npm install` writes its own
const SKIP = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.a11y',
  '.data',
  '.env',
  'package-lock.json',
]);
const keep = (src) => {
  const name = basename(src);
  if (SKIP.has(name)) return false;
  if (name.startsWith('.env.') && name !== '.env.example') return false;
  return !/\.(sqlite3?|db)$|\.sqlite-/.test(name);
};

mkdirSync(dest, { recursive: true });
cpSync(app, dest, { recursive: true, filter: keep });
cpSync(join(apps, 'packages/ui'), join(dest, 'vendor/ui'), { recursive: true, filter: keep });
cpSync(join(apps, 'packages/colors'), join(dest, 'vendor/colors'), {
  recursive: true,
  filter: keep,
});
cpSync(join(apps, 'ENGINEERING.md'), join(dest, 'ENGINEERING.md'));

// ENGINEERING.md sat one folder above the app; in the copy it sits beside it
const relink = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory() && e.name !== 'vendor' && e.name !== 'node_modules') relink(p);
    else if (e.name.endsWith('.md') && p !== join(dest, 'ENGINEERING.md')) {
      const md = readFileSync(p, 'utf8');
      const out = md.replace(/\]\(\.\.\/((?:\.\.\/)*)ENGINEERING\.md/g, '](./$1ENGINEERING.md');
      if (out !== md) writeFileSync(p, out);
    }
  }
};
relink(dest);

// .dockerignore: apps/'s, which ignores the same things in the same context shape
const ignore = readFileSync(join(apps, '.dockerignore'), 'utf8')
  .replace(/^# Build context.*$/m, '# Build context for Dockerfile (the context is this folder).')
  .replace(/^portfolio\n/m, '');
writeFileSync(join(dest, '.dockerignore'), ignore);

// Dockerfile: the build context is the app's own folder, not apps/
let docker = readFileSync(join(app, 'Dockerfile'), 'utf8');
const swap = (from, to, times) => {
  const n = docker.split(from).length - 1;
  if (n !== times) {
    console.error(`export: Dockerfile has ${n} of ${JSON.stringify(from)}, expected ${times}.`);
    process.exit(1);
  }
  docker = docker.replaceAll(from, to);
};
swap(
  '# Build context is apps/ (the npm workspace root), so the lockfile, .npmrc and\n# the shared packages are all visible. From apps/:\n#   docker build -f base-app/Dockerfile -t base-app .\n#   docker run -p 8787:8787 --env-file base-app/.env base-app\n',
  '# Build context is this folder (exported from the glasswork-ui base-app, with\n# @apps/ui and @apps/colors in vendor/). Run `npm install` once first so package-lock.json\n# exists. From this folder:\n#   docker build -t base-app .\n#   docker run -p 8787:8787 --env-file .env base-app\n',
  1,
);
swap(
  'COPY packages/colors/package.json packages/colors/\n',
  'COPY vendor/colors/package.json vendor/colors/\n',
  2,
);
swap('COPY packages/ui/package.json packages/ui/\n', 'COPY vendor/ui/package.json vendor/ui/\n', 2);
swap('COPY base-app/package.json base-app/\n', '', 2);
swap('RUN npm run build -w @apps/base-app\n', 'RUN npm run build\n', 1);
swap('COPY --from=build /app/base-app/', 'COPY --from=build /app/', 5);
swap(' ./base-app/', ' ./', 5);
swap('WORKDIR /app/base-app\n', '', 1);
// the export keeps the shared packages in vendor/, and the app sits at /app, not /app/base-app
swap(
  'COPY --from=build /app/packages/colors/src ./packages/colors/src\n',
  'COPY --from=build /app/vendor/colors/src ./vendor/colors/src\n',
  1,
);
swap('VOLUME /app/base-app/data/uploads\n', 'VOLUME /app/data/uploads\n', 1);
writeFileSync(join(dest, 'Dockerfile'), docker);

console.log(
  `Exported base-app to ${dest} (with @apps/ui and @apps/colors in vendor/). Next, in ${dest}:`,
);
console.log('  npm install && npm run verify && npm run build');
