import { describe, expect, it } from 'vitest';
import { describeEnv, EnvError, readServerEnv } from './env.ts';

describe('readServerEnv', () => {
  it('applies the .env.example defaults when nothing is set', () => {
    const env = readServerEnv({});
    expect(env.apiHost).toBe('127.0.0.1');
    expect(env.apiPort).toBe(8787);
    expect(env.databaseUrl).toBe('sqlite::memory:');
    expect(env.allowedOrigins).toEqual([
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:8787',
      'http://localhost:8787',
    ]);
    expect(env.llm.defaultProvider).toBe('anthropic');
    expect(env.llm.timeoutMs).toBe(120_000);
    expect(env.llm.anthropic).toEqual({
      apiKey: undefined,
      model: 'claude-opus-5-5',
      fallbacks: 'default',
    });
    expect(env.llm.gemini).toEqual({ apiKey: undefined, model: 'gemini-flash-latest' });
  });

  it('treats empty strings as unset', () => {
    const env = readServerEnv({
      API_PORT: '',
      ANTHROPIC_API_KEY: '',
      DATABASE_URL: '   ',
      LLM_PROVIDER: '',
    });
    expect(env.apiPort).toBe(8787);
    expect(env.llm.anthropic.apiKey).toBeUndefined();
    expect(env.databaseUrl).toBe('sqlite::memory:');
    expect(env.llm.defaultProvider).toBe('anthropic');
  });

  it("adds ALLOWED_ORIGINS to the app's own origins and drops blanks", () => {
    const env = readServerEnv({ ALLOWED_ORIGINS: 'https://a.example, ,https://b.example' });
    expect(env.allowedOrigins).toEqual([
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:8787',
      'http://localhost:8787',
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('names the variable, not its value, for a bad port', () => {
    for (const bad of ['99999', 'abc', '0']) {
      const message = thrownMessage(() => readServerEnv({ API_PORT: bad }));
      expect(message).toContain('API_PORT');
      expect(message).not.toContain(bad);
    }
    expect(() => readServerEnv({ API_PORT: 'abc' })).toThrow(EnvError);
  });

  it('rejects an unknown provider without echoing it', () => {
    const message = thrownMessage(() => readServerEnv({ LLM_PROVIDER: 'openai-secret-value' }));
    expect(message).toContain('LLM_PROVIDER');
    expect(message).not.toContain('openai-secret-value');
  });

  it('rejects a bad timeout and a bad fallbacks switch by name', () => {
    expect(() => readServerEnv({ LLM_TIMEOUT_MS: 'soon' })).toThrow(/LLM_TIMEOUT_MS/);
    expect(() => readServerEnv({ ANTHROPIC_FALLBACKS: 'maybe' })).toThrow(/ANTHROPIC_FALLBACKS/);
  });
});

describe('describeEnv', () => {
  it('shows set or missing, never a secret value, and redacts the database password', () => {
    const env = readServerEnv({
      ANTHROPIC_API_KEY: 'sk-ant-test-secret-123',
      DATABASE_URL: 'postgres://george:pw-secret-456@db.example:5432/app',
    });
    const described = describeEnv(env);
    const text = JSON.stringify(described);

    expect(described.ANTHROPIC_API_KEY).toBe('set');
    expect(described.GEMINI_API_KEY).toBe('missing');
    expect(described.DATABASE_URL).toBe('postgres://db.example:5432/app');
    expect(text).not.toContain('sk-ant-test-secret-123');
    expect(text).not.toContain('pw-secret-456');
  });
});

/* Returns the message a call throws, or '' if it does not throw. */
function thrownMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return '';
}

describe('readServerEnv on Vercel', () => {
  const vercel = {
    VERCEL: '1',
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://u:p@h/db',
    ADMIN_EMAIL: 'owner@example.com',
    ADMIN_PASSWORD: 'a-long-enough-password',
    MAIL_TRANSPORT: 'log',
    VERCEL_URL: 'app-abc123.vercel.app',
    VERCEL_PROJECT_PRODUCTION_URL: 'app.example.org',
  };

  it('trusts the proxy, answers the deployment hosts and does not serve the client', () => {
    const env = readServerEnv(vercel);
    expect(env.vercel).toBe(true);
    expect(env.trustProxy).toBe(true);
    expect(env.serveDist).toBe(false);
    expect(env.ssr).toBe('off');
    expect(env.dbPoolMax).toBe(3);
    expect(env.publicHosts).toEqual(['app-abc123.vercel.app', 'app.example.org']);
    expect(env.allowedOrigins).toContain('https://app.example.org');
    expect(env.appBaseUrl).toBe('https://app.example.org');
    expect(env.auth.cookieSecure).toBe(true);
  });

  it('prefers APP_BASE_URL and lets its host in too', () => {
    const env = readServerEnv({ ...vercel, APP_BASE_URL: 'https://friends.example.org' });
    expect(env.appBaseUrl).toBe('https://friends.example.org');
    expect(env.publicHosts).toContain('friends.example.org');
  });

  it('changes nothing off Vercel', () => {
    const env = readServerEnv({
      ...vercel,
      VERCEL: undefined,
      APP_BASE_URL: 'https://a.example.org',
    });
    expect(env.vercel).toBe(false);
    expect(env.trustProxy).toBe(false);
    expect(env.publicHosts).toEqual([]);
    expect(env.dbPoolMax).toBe(10);
  });
});

describe('SSR_MODE: who answers page requests', () => {
  const production = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://u:p@h/db',
    ADMIN_EMAIL: 'owner@example.com',
    ADMIN_PASSWORD: 'a-long-enough-password',
    MAIL_TRANSPORT: 'log',
    APP_BASE_URL: 'https://app.example.org',
  };

  it('is the built server render in production, Vite inside the process in development', () => {
    expect(readServerEnv(production).ssr).toBe('dist');
    const dev = readServerEnv({});
    expect(dev.ssr).toBe('dev');
    expect(dev.webPort).toBe(5173);
  });

  it('can be switched off for an API-only server', () => {
    expect(readServerEnv({ SSR_MODE: 'off' }).ssr).toBe('off');
  });

  it('refuses nonsense, Vite in production and the built render without the built client', () => {
    expect(() => readServerEnv({ SSR_MODE: 'yes' })).toThrow('SSR_MODE must be');
    expect(() => readServerEnv({ ...production, SSR_MODE: 'dev' })).toThrow('development only');
    expect(() => readServerEnv({ SSR_MODE: 'dist' })).toThrow('SERVE_DIST');
  });
});
