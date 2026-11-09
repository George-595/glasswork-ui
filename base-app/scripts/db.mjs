// Local Postgres + MySQL for development and tests (compose.yaml). DEV ONLY.
//
//   node scripts/db.mjs up        start both containers and wait until healthy
//   node scripts/db.mjs down      stop them (data stays in the named volumes)
//   node scripts/db.mjs reset     delete the volumes and the local sqlite file, then start fresh
//   node scripts/db.mjs psql      psql shell on the development database
//   node scripts/db.mjs mysql     mysql shell on the development database
//   node scripts/db.mjs dev pg|mysql   `npm run dev` against that container
//   node scripts/db.mjs test      the integration suites on SQLite, Postgres and MySQL
//
// Always run through the npm scripts (db:up, db:down, db:reset, db:psql, db:mysql, dev:pg,
// dev:mysql, test:db). Ports: POSTGRES_PORT (5432) and MYSQL_PORT (3306), both bound to
// 127.0.0.1. The passwords are the fixed, public development values in compose.yaml.
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const pgPort = process.env.POSTGRES_PORT || '5432';
const myPort = process.env.MYSQL_PORT || '3306';
const PG_PASSWORD = 'app_dev_only';
const MY_PASSWORD = 'app_dev_only';

const url = {
  pg: (db) => `postgres://app:${PG_PASSWORD}@127.0.0.1:${pgPort}/${db}`,
  mysql: (db) => `mysql://app:${MY_PASSWORD}@127.0.0.1:${myPort}/${db}`,
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: app, stdio: 'inherit', ...opts });
  if (r.error) {
    console.error(`db: could not run ${cmd}: ${r.error.message}`);
    process.exit(1);
  }
  return r.status ?? 1;
}
const compose = (...args) => run('docker', ['compose', ...args]);
const must = (code) => {
  if (code !== 0) process.exit(code);
};

function up() {
  const code = compose('up', '-d', '--wait');
  if (code !== 0) {
    console.error(
      'db: the containers did not start. Is Docker running? `docker compose logs` shows why.',
    );
  }
  must(code);
  console.info(`db: postgres ${url.pg('app')}\ndb: mysql    ${url.mysql('app')}`);
}

/** Runs a child to completion, forwarding its exit code. */
function exec(cmd, args, env) {
  const child = spawn(cmd, args, { cwd: app, stdio: 'inherit', env: { ...process.env, ...env } });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'up':
    up();
    break;
  case 'down':
    must(compose('down'));
    break;
  case 'reset': {
    must(compose('down', '--volumes', '--remove-orphans'));
    // the file database of `sqlite:./.data/app.sqlite` (and its -wal / -shm files)
    const dir = join(app, '.data');
    try {
      for (const f of readdirSync(dir)) {
        if (/\.(sqlite3?|db)(-.*)?$/.test(f)) rmSync(join(dir, f), { force: true });
      }
    } catch {
      // no .data folder: nothing to delete
    }
    up();
    break;
  }
  case 'psql':
    must(
      compose('exec', '-e', `PGPASSWORD=${PG_PASSWORD}`, 'postgres', 'psql', '-U', 'app', 'app'),
    );
    break;
  case 'mysql':
    must(compose('exec', '-e', `MYSQL_PWD=${MY_PASSWORD}`, 'mysql', 'mysql', '-uapp', 'app'));
    break;
  case 'dev': {
    const which = rest[0];
    if (which !== 'pg' && which !== 'mysql') {
      console.error('usage: db.mjs dev pg|mysql');
      process.exit(2);
    }
    up();
    exec('npm', ['run', 'dev'], { DATABASE_URL: url[which]('app') });
    break;
  }
  case 'test': {
    up();
    // TEST_*_URL name the app_test database; each test run creates and drops its own database from it
    exec('vitest', ['run', '--project', 'server', 'infra/db', 'repositories', ...rest], {
      TEST_POSTGRES_URL: url.pg('app_test'),
      TEST_MYSQL_URL: url.mysql('app_test'),
    });
    break;
  }
  default:
    console.error('usage: db.mjs up|down|reset|psql|mysql|dev pg|mysql|test');
    process.exit(2);
}
