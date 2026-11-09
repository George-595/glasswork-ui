import { describe, expect, it } from 'vitest';
import { describeEnv, EnvError, readServerEnv } from './env.ts';

function thrownMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return '';
}

/* What production needs besides what a test is about: a database and a first admin. */
const PROD_BASE: Record<string, string | undefined> = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@h/db',
  ADMIN_EMAIL: 'owner@example.com',
  ADMIN_PASSWORD: 'a-long-real-password',
};

/* ... and everything else production insists on, so a test can be about one thing. */
const COMPLETE: Record<string, string | undefined> = {
  ...PROD_BASE,
  MAIL_TRANSPORT: 'log',
  APP_BASE_URL: 'https://app.example.com',
};

describe('env hardening', () => {
  it('refuses a non-loopback API_HOST (the API has no authentication)', () => {
    expect(() => readServerEnv({ API_HOST: '0.0.0.0' })).toThrow(EnvError);
    expect(() => readServerEnv({ API_HOST: '0.0.0.0' })).toThrow(/API_HOST/);
    expect(readServerEnv({ API_HOST: 'localhost' }).apiHost).toBe('localhost');
  });

  it('derives the default origins from WEB_PORT', () => {
    expect(readServerEnv({ WEB_PORT: '5200' }).allowedOrigins).toEqual([
      'http://127.0.0.1:5200',
      'http://localhost:5200',
      'http://127.0.0.1:8787',
      'http://localhost:8787',
    ]);
  });

  it('ignores a trailing slash in ALLOWED_ORIGINS', () => {
    const origins = readServerEnv({ ALLOWED_ORIGINS: 'https://app.example/' }).allowedOrigins;
    expect(origins).toContain('https://app.example');
    expect(origins).not.toContain('https://app.example/');
  });

  it('logs no credentials or query from DATABASE_URL', () => {
    for (const url of [
      'mysql://u@h:3306/db?password=hunter2',
      'postgres://u:p@ss@host/db',
      'postgres://u:pa/ss@host:5432/db',
    ]) {
      const shown = describeEnv(readServerEnv({ DATABASE_URL: url })).DATABASE_URL ?? '';
      expect(shown).not.toMatch(/hunter2|p@ss|pa\/ss|ss@/);
      expect(shown).not.toContain('u:');
    }
  });

  it('development uses the fixed dev login unless overridden', () => {
    expect(readServerEnv({}).auth).toMatchObject({
      adminEmail: 'admin@example.test',
      adminPassword: 'adminpassword',
    });
    expect(readServerEnv({ ADMIN_PASSWORD: 'mine' }).auth.adminPassword).toBe('mine');
  });

  it('production refuses to start without a real ADMIN_PASSWORD', () => {
    const base = { ...PROD_BASE, ADMIN_PASSWORD: undefined };
    expect(() => readServerEnv(base)).toThrow(/ADMIN_PASSWORD must be set/);
    expect(() => readServerEnv({ ...base, ADMIN_PASSWORD: 'adminpassword' })).toThrow(
      /development password/,
    );
    expect(() => readServerEnv({ ...base, ADMIN_PASSWORD: 'short' })).toThrow(/12 characters/);
    const env = readServerEnv({
      ...base,
      ADMIN_PASSWORD: 'a-long-real-password',
      MAIL_TRANSPORT: 'log',
      APP_BASE_URL: 'https://app.example.com',
    });
    expect(env.auth).toMatchObject({ adminEmail: 'owner@example.com', cookieSecure: true });
  });

  it('production refuses to start without ADMIN_EMAIL, rather than seeding admin@example.com (SEC-08)', () => {
    const base = { ...COMPLETE, ADMIN_EMAIL: undefined };
    expect(() => readServerEnv(base)).toThrow(/ADMIN_EMAIL must be set in production/);
    expect(() => readServerEnv({ ...base, ADMIN_EMAIL: 'not an address' })).toThrow(
      /ADMIN_EMAIL must be an email address/,
    );
    expect(readServerEnv({ ...base, ADMIN_EMAIL: 'owner@example.com' }).auth.adminEmail).toBe(
      'owner@example.com',
    );
    // development keeps the fixed dev login
    expect(readServerEnv({}).auth.adminEmail).toBe('admin@example.test');
  });

  it('production refuses to start without DATABASE_URL, instead of using memory that vanishes (DATA-7)', () => {
    const base = { ...COMPLETE, DATABASE_URL: undefined };
    expect(() => readServerEnv(base)).toThrow(/DATABASE_URL must be set in production/);
    expect(readServerEnv({ ...base, DATABASE_URL: 'postgres://u:p@h/db' }).databaseUrl).toBe(
      'postgres://u:p@h/db',
    );
    // development still defaults to a throwaway in-memory database
    expect(readServerEnv({}).databaseUrl).toBe('sqlite::memory:');
    // the error names the variable and never a value
    expect(
      thrownMessage(() => readServerEnv({ ...base, DATABASE_URL: undefined, ADMIN_PASSWORD: 'x' })),
    ).not.toContain('postgres://');
  });

  it('on Vercel a SQLite URL is refused too: its filesystem is read-only and per instance (DATA-7)', () => {
    const vercel = { ...COMPLETE, VERCEL: '1' };
    for (const url of ['sqlite::memory:', 'sqlite:./data/app.db', 'SQLITE:/tmp/x.db']) {
      expect(() => readServerEnv({ ...vercel, DATABASE_URL: url })).toThrow(
        /DATABASE_URL must be a Postgres or MySQL database on Vercel/,
      );
    }
    expect(readServerEnv({ ...vercel, DATABASE_URL: 'postgres://u:p@h/db' }).databaseUrl).toBe(
      'postgres://u:p@h/db',
    );
    // the one acknowledged exception: a test that drives the Vercel entry on a temporary file
    expect(
      readServerEnv({
        ...vercel,
        DATABASE_URL: 'sqlite:./x.db',
        ALLOW_SQLITE_ON_VERCEL: 'true',
      }).databaseUrl,
    ).toBe('sqlite:./x.db');
    expect(() =>
      readServerEnv({ ...vercel, DATABASE_URL: 'sqlite:./x.db', ALLOW_SQLITE_ON_VERCEL: 'yes' }),
    ).toThrow(/Postgres or MySQL/);
    // a Docker or home server in production may still choose SQLite on a disk it keeps
    expect(readServerEnv({ ...COMPLETE, DATABASE_URL: 'sqlite:./data/app.db' }).databaseUrl).toBe(
      'sqlite:./data/app.db',
    );
  });

  it('VERCEL=1 alone is production: no NODE_ENV does not open the dev defaults (SEC-14)', () => {
    const bare = { VERCEL: '1' };
    // no dev admin password is ever accepted or defaulted
    expect(() => readServerEnv(bare)).toThrow(/DATABASE_URL must be set in production/);
    const base = { ...bare, DATABASE_URL: 'postgres://u:p@h/db', ADMIN_EMAIL: 'o@example.com' };
    expect(() => readServerEnv(base)).toThrow(/ADMIN_PASSWORD must be set/);
    expect(() => readServerEnv({ ...base, ADMIN_PASSWORD: 'adminpassword' })).toThrow(
      /development password/,
    );
    const env = readServerEnv({
      ...base,
      ADMIN_PASSWORD: 'a-long-real-password',
      MAIL_TRANSPORT: 'log',
      APP_BASE_URL: 'https://app.example.com',
    });
    expect(env.production).toBe(true);
    expect(env.auth.cookieSecure).toBe(true);
    expect(env.auth.adminPassword).toBe('a-long-real-password');
    // an explicit NODE_ENV=development on Vercel does not turn it back into a dev server
    expect(
      readServerEnv({
        ...base,
        NODE_ENV: 'development',
        ADMIN_PASSWORD: 'a-long-real-password',
        MAIL_TRANSPORT: 'log',
        APP_BASE_URL: 'https://app.example.com',
      }).production,
    ).toBe(true);
  });

  it('APP_BASE_URL: a dev default, required in production, and only an http(s) URL with no credentials, query or fragment', () => {
    expect(readServerEnv({}).appBaseUrl).toBe('http://localhost:5173');
    expect(readServerEnv({ WEB_PORT: '4000' }).appBaseUrl).toBe('http://localhost:4000');
    const prod = { ...PROD_BASE, MAIL_TRANSPORT: 'log' };
    expect(() => readServerEnv(prod)).toThrow(/APP_BASE_URL must be set/);
    expect(readServerEnv({ ...prod, APP_BASE_URL: 'https://app.example.com/' }).appBaseUrl).toBe(
      'https://app.example.com',
    );
    for (const bad of [
      'app.example.com',
      'ftp://app.example.com',
      'https://user:pw@app.example.com',
      'https://app.example.com/?x=1',
    ]) {
      expect(() => readServerEnv({ APP_BASE_URL: bad })).toThrow(/APP_BASE_URL/);
    }
  });

  it('UPLOADS_DIR defaults to ./data/uploads', () => {
    expect(readServerEnv({}).uploadsDir).toBe('./data/uploads');
    expect(readServerEnv({ UPLOADS_DIR: '/var/app/uploads' }).uploadsDir).toBe('/var/app/uploads');
  });

  it('cookies are Secure in production only by default', () => {
    expect(readServerEnv({}).auth.cookieSecure).toBe(false);
  });
});

describe('mail and base URL', () => {
  const prod = PROD_BASE;

  it('development logs mail and links to the Vite server by default', () => {
    const env = readServerEnv({});
    expect(env.mail).toEqual({
      transport: 'log',
      from: 'Base app <no-reply@localhost>',
      resendApiKey: undefined,
    });
    expect(env.appBaseUrl).toBe('http://localhost:5173');
    expect(readServerEnv({ WEB_PORT: '3000' }).appBaseUrl).toBe('http://localhost:3000');
  });

  it('production must choose a transport and a base URL', () => {
    expect(() => readServerEnv(prod)).toThrow(/MAIL_TRANSPORT must be set/);
    expect(() => readServerEnv({ ...prod, MAIL_TRANSPORT: 'log' })).toThrow(
      /APP_BASE_URL must be set/,
    );
    const env = readServerEnv({
      ...prod,
      MAIL_TRANSPORT: 'log',
      APP_BASE_URL: 'https://a.example.com/',
    });
    expect(env.mail.transport).toBe('log');
    expect(env.appBaseUrl).toBe('https://a.example.com');
  });

  it('resend needs its key, and in production a From address', () => {
    expect(() => readServerEnv({ MAIL_TRANSPORT: 'resend' })).toThrow(/RESEND_API_KEY/);
    const dev = readServerEnv({ MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_x' });
    expect(dev.mail).toMatchObject({ transport: 'resend', resendApiKey: 're_x' });
    const base = {
      ...prod,
      MAIL_TRANSPORT: 'resend',
      RESEND_API_KEY: 're_x',
      APP_BASE_URL: 'https://a.example.com',
    };
    expect(() => readServerEnv(base)).toThrow(/MAIL_FROM must be set/);
    expect(readServerEnv({ ...base, MAIL_FROM: 'App <app@a.example.com>' }).mail.from).toBe(
      'App <app@a.example.com>',
    );
  });

  it('rejects an unknown transport, a bad base URL, plain http in production and a multi-line From', () => {
    expect(() => readServerEnv({ MAIL_TRANSPORT: 'smtp' })).toThrow(/"log" or "resend"/);
    expect(() => readServerEnv({ APP_BASE_URL: 'not a url' })).toThrow(/full http\(s\) URL/);
    expect(() => readServerEnv({ APP_BASE_URL: 'ftp://x.example.com' })).toThrow(
      /full http\(s\) URL/,
    );
    expect(() =>
      readServerEnv({ ...prod, MAIL_TRANSPORT: 'log', APP_BASE_URL: 'http://a.example.com' }),
    ).toThrow(/https in production/);
    expect(() => readServerEnv({ MAIL_FROM: 'a\nBcc: b@c.d' })).toThrow(/one line/);
  });

  it('never describes the API key', () => {
    const env = readServerEnv({ MAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_SECRET' });
    expect(JSON.stringify(describeEnv(env))).not.toContain('SECRET');
  });
});
