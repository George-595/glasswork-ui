import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { Toaster } from '~/core/ui';
import { formatViolations, runAxe } from '~/test/axe';
import { changeValue, click, getByRole } from '~/test/dom';
import { ADMIN, mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import AccountPage from './AccountPage';

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
});
beforeEach(() => {
  URL.createObjectURL = vi.fn<(f: Blob) => string>(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn<(u: string) => void>();
});

const PROFILE = {
  id: ADMIN.id,
  name: 'Ada Admin',
  email: ADMIN.email,
  role: 'admin',
  avatarUrl: null,
};
const SESSIONS = [
  {
    id: 's1',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
    ip: '203.0.113.5',
    createdAt: '2026-10-12T08:00:00.000Z',
    lastSeenAt: '2026-10-12T09:00:00.000Z',
    current: true,
  },
  {
    id: 's2',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    ip: '198.51.100.7',
    createdAt: '2026-10-10T08:00:00.000Z',
    lastSeenAt: '2026-10-11T09:00:00.000Z',
    current: false,
  },
];
const ok = (body: Record<string, unknown> = {}) => ({ body: { ok: true, ...body } });
const fail = (status: number, code: string, message: string) => ({
  status,
  body: { ok: false, error: { code, message } },
});

type Routes = NonNullable<Parameters<typeof mockApi>[0]>['routes'];

async function mount(routes: Routes = {}) {
  const api = mockApi({
    routes: {
      'GET /api/account': ok({ account: PROFILE }),
      'GET /api/account/sessions': ok({ sessions: SESSIONS }),
      ...routes,
    },
  });
  view = await render(
    <AuthProvider>
      <AccountPage />
      <Toaster />
    </AuthProvider>,
  );
  await flush(6);
  return api;
}

const field = (name: string) => {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!el) throw new Error(`no field ${name}`);
  return el;
};

async function choosePhoto(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('no file input');
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('AccountPage', () => {
  it('shows the profile, with the email read-only', async () => {
    await mount();
    expect(document.querySelector('h1')?.textContent).toBe('Account');
    expect(field('name').value).toBe('Ada Admin');
    expect(field('email').readOnly).toBe(true);
    expect(field('email').value).toBe(ADMIN.email);
    // nothing to save until the name changes
    expect(getByRole(document.body, 'button', 'Save profile').hasAttribute('disabled')).toBe(true);
  });

  it('saves a new name through PATCH /api/account', async () => {
    let sent: unknown;
    const api = await mount({
      'PATCH /api/account': (req) => {
        sent = req.body;
        return ok({ account: { ...PROFILE, name: 'Ada B' } });
      },
    });
    await changeValue(field('name'), 'Ada B');
    await click(getByRole(document.body, 'button', 'Save profile'));
    await flush(4);
    expect(sent).toEqual({ name: 'Ada B' });
    expect(document.body.textContent).toContain('Profile updated');
    // the shell's own copy of who you are is asked again
    expect(api.calls.filter((c) => c === 'GET /api/auth/me').length).toBeGreaterThan(1);
  });

  it('uploads a chosen photo as the raw body and removes it', async () => {
    const api = await mount({
      'GET /api/account': ok({ account: { ...PROFILE, avatarUrl: '/api/files/old' } }),
      'PUT /api/account/avatar': ok({ avatarUrl: '/api/files/new' }),
      'DELETE /api/account/avatar': ok({ avatarUrl: null }),
    });
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'me.png', {
      type: 'image/png',
    });
    await choosePhoto(png);
    await click(getByRole(document.body, 'button', 'Save photo'));
    await flush(4);
    const put = api.fetch.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put?.[1]?.body).toBe(png);
    expect(new Headers(put?.[1]?.headers).get('content-type')).toBe('image/png');
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/api/files/new');

    await click(getByRole(document.body, 'button', 'Remove'));
    await flush(4);
    expect(api.calls).toContain('DELETE /api/account/avatar');
    expect(document.querySelector('img')).toBeNull();
  });

  it("shows the server's refusal of a photo", async () => {
    await mount({
      'PUT /api/account/avatar': fail(
        415,
        'unsupported_image',
        'Upload a PNG, JPEG or WebP image.',
      ),
    });
    await choosePhoto(new File(['x'], 'me.png', { type: 'image/png' }));
    await click(getByRole(document.body, 'button', 'Save photo'));
    await flush(4);
    expect(document.body.textContent).toContain('Upload a PNG, JPEG or WebP image.');
  });

  it('changes the password, clears the fields and reloads the sessions', async () => {
    let sent: unknown;
    const api = await mount({
      'POST /api/account/password': (req) => {
        sent = req.body;
        return ok();
      },
    });
    await changeValue(field('current-password'), 'old password here');
    await changeValue(field('new-password'), 'quiet-harbour-lamp-4721');
    await click(getByRole(document.body, 'button', 'Change password'));
    await flush(4);
    expect(sent).toEqual({
      currentPassword: 'old password here',
      newPassword: 'quiet-harbour-lamp-4721',
    });
    expect(field('current-password').value).toBe('');
    expect(field('new-password').value).toBe('');
    expect(document.body.textContent).toContain('Password changed');
    expect(api.calls.filter((c) => c === 'GET /api/account/sessions')).toHaveLength(2);
  });

  it('puts a wrong current password under that field and a policy refusal under the new one', async () => {
    await mount({
      'POST /api/account/password': fail(
        400,
        'incorrect_password',
        'Your current password is incorrect.',
      ),
    });
    await changeValue(field('current-password'), 'nope');
    await changeValue(field('new-password'), 'quiet-harbour-lamp-4721');
    await click(getByRole(document.body, 'button', 'Change password'));
    await flush(4);
    expect(field('current-password').getAttribute('aria-invalid')).toBe('true');
    expect(document.body.textContent).toContain('Your current password is incorrect.');
    expect(field('new-password').getAttribute('aria-invalid')).toBeNull();

    mockApi({
      routes: {
        'GET /api/account': ok({ account: PROFILE }),
        'GET /api/account/sessions': ok({ sessions: SESSIONS }),
        'POST /api/account/password': fail(400, 'password_common', 'That password is too common.'),
      },
    });
    await click(getByRole(document.body, 'button', 'Change password'));
    await flush(4);
    expect(field('new-password').getAttribute('aria-invalid')).toBe('true');
    expect(document.body.textContent).toContain('That password is too common.');
  });

  it('lists the sessions, marks this device and signs another out after confirming', async () => {
    const api = await mount({ 'DELETE /api/account/sessions/s2': ok() });
    expect(document.body.textContent).toContain('This device');
    expect(document.body.textContent).toContain('Chrome on macOS');
    expect(document.body.textContent).toContain('Firefox on Windows');
    await click(getByRole(document.body, 'button', /^Sign out Firefox on Windows/));
    await flush(2);
    const dialog = getByRole(document.body, 'dialog');
    await click(getByRole(dialog, 'button', 'Sign out'));
    await flush(4);
    expect(api.calls).toContain('DELETE /api/account/sessions/s2');
    expect(api.calls.filter((c) => c === 'GET /api/account/sessions')).toHaveLength(2);
  });

  it('signs out all other sessions', async () => {
    const api = await mount({ 'POST /api/account/sessions/revoke-others': ok({ revoked: 1 }) });
    await click(getByRole(document.body, 'button', 'Sign out all other sessions'));
    await flush(2);
    await click(getByRole(getByRole(document.body, 'dialog'), 'button', 'Sign out'));
    await flush(4);
    expect(api.calls).toContain('POST /api/account/sessions/revoke-others');
  });

  it('links to the notification preferences', async () => {
    await mount();
    expect(getByRole(document.body, 'link', 'Notification preferences').getAttribute('href')).toBe(
      '/notifications',
    );
  });

  it('has no axe violations', async () => {
    await mount();
    expect(formatViolations(await runAxe())).toBe('');
  });
});
