/* Client configuration. Only VITE_* variables reach the browser bundle. */
export interface ClientConfig {
  appName: string;
  apiBase: string;
  /** Whether to open the live-update stream. False on a host that cannot hold one open (Vercel). */
  realtime: boolean;
}

type ClientEnvKey = 'VITE_APP_NAME' | 'VITE_API_BASE' | 'VITE_REALTIME';

const DEFAULT_APP_NAME = 'Base app';
const DEFAULT_API_BASE = '/api';

export function readClientConfig(env: Partial<Record<ClientEnvKey, string>> = {}): ClientConfig {
  const appName = env.VITE_APP_NAME?.trim() || DEFAULT_APP_NAME;
  const apiBase = (env.VITE_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/+$/, '');
  // VITE_REALTIME=off turns the live stream off; anything else (or nothing) leaves it on
  const realtime = env.VITE_REALTIME?.trim().toLowerCase() !== 'off';
  return { appName, apiBase, realtime };
}

export const config: ClientConfig = readClientConfig(import.meta.env);
