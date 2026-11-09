import { describe, expect, it } from 'vitest';
import { readClientConfig } from './env';

describe('readClientConfig', () => {
  it('uses the defaults when nothing is set', () => {
    expect(readClientConfig({})).toEqual({
      appName: 'Base app',
      apiBase: '/api',
      realtime: true,
    });
  });

  it('treats an empty string as unset', () => {
    expect(readClientConfig({ VITE_APP_NAME: '', VITE_API_BASE: '' })).toEqual({
      appName: 'Base app',
      apiBase: '/api',
      realtime: true,
    });
  });

  it('turns the live stream off only for VITE_REALTIME=off', () => {
    expect(readClientConfig({ VITE_REALTIME: 'off' }).realtime).toBe(false);
    expect(readClientConfig({ VITE_REALTIME: ' OFF ' }).realtime).toBe(false);
    expect(readClientConfig({ VITE_REALTIME: 'on' }).realtime).toBe(true);
    expect(readClientConfig({ VITE_REALTIME: '' }).realtime).toBe(true);
  });

  it('strips trailing slashes from the API base', () => {
    expect(readClientConfig({ VITE_API_BASE: 'https://api.example.com/v1//' }).apiBase).toBe(
      'https://api.example.com/v1',
    );
  });

  it('reads the app name', () => {
    expect(readClientConfig({ VITE_APP_NAME: 'Ledger' }).appName).toBe('Ledger');
  });
});
