import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { formatViolations, runAxe } from '~/test/axe';
import { changeValue, click, getByRole, press } from '~/test/dom';
import { ADMIN, mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import LoginPage from './LoginPage';

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
});

async function mount() {
  mockApi({ user: null });
  view = await render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );
  await flush();
  return view;
}

function password(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>('input[type="password"]');
  if (!el) throw new Error('no password field');
  return el;
}

describe('LoginPage', () => {
  it('has the title, labelled email and password fields, and focuses the email on mount', async () => {
    await mount();

    expect(document.querySelector('h1')?.textContent).toBe('Sign in');
    const email = getByRole(document.body, 'textbox', 'Email');
    expect(email.getAttribute('type')).toBe('email');
    expect(email.getAttribute('autocomplete')).toBe('username');
    expect(password().getAttribute('autocomplete')).toBe('current-password');
    expect(document.activeElement).toBe(email);
  });

  it('shows the incorrect-password alert for invalid_credentials', async () => {
    mockApi({
      user: null,
      routes: {
        'POST /api/auth/login': {
          status: 401,
          body: { ok: false, error: { code: 'invalid_credentials', message: 'Nope.' } },
        },
      },
    });
    view = await render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );
    await flush();
    await changeValue(getByRole(document.body, 'textbox', 'Email'), ADMIN.email);
    await changeValue(password(), 'wrong');
    await click(getByRole(document.body, 'button', 'Sign in'));
    await flush();

    expect(getByRole(document.body, 'alert').textContent).toBe(
      "That email or password isn't right.",
    );
  });

  it('shows the API message for any other failure', async () => {
    mockApi({
      user: null,
      routes: {
        'POST /api/auth/login': {
          status: 500,
          body: { ok: false, error: { code: 'internal_error', message: 'Database is down.' } },
        },
      },
    });
    view = await render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );
    await flush();
    await changeValue(getByRole(document.body, 'textbox', 'Email'), ADMIN.email);
    await changeValue(password(), 'pw');
    await click(getByRole(document.body, 'button', 'Sign in'));
    await flush();

    expect(getByRole(document.body, 'alert').textContent).toBe('Database is down.');
  });

  it('disables the submit button while the sign-in is in flight', async () => {
    const api = mockApi({
      delay: true,
      user: null,
      routes: { 'POST /api/auth/login': { body: { ok: true, user: ADMIN } } },
    });
    view = await render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );
    await flush();
    await changeValue(getByRole(document.body, 'textbox', 'Email'), ADMIN.email);
    await changeValue(password(), 'pw');
    await click(getByRole(document.body, 'button', 'Sign in'));
    await flush(1);

    const submit = document.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submit?.getAttribute('aria-disabled')).toBe('true');
    expect(submit?.disabled).toBe(false);
    expect(submit?.textContent).toBe('Signing in…');

    await act(async () => {
      api.release();
    });
    await flush();
  });

  it('shows and hides the password without losing focus or the value', async () => {
    await mount();
    await changeValue(password(), 'secret');
    const toggle = getByRole(document.body, 'button', 'Show password');
    toggle.focus();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    await click(toggle);
    const field = document.querySelector<HTMLInputElement>('input[name="password"]');
    expect(field?.getAttribute('type')).toBe('text');
    expect(field?.value).toBe('secret');
    const hide = getByRole(document.body, 'button', 'Hide password');
    expect(hide).toBe(toggle);
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(toggle);

    await click(hide);
    expect(field?.getAttribute('type')).toBe('password');
    expect(toggle.getAttribute('aria-label')).toBe('Show password');
  });

  it('warns politely when Caps Lock is on, tied to the field, and clears on blur', async () => {
    await mount();
    const field = password();
    const status = () => document.querySelector('form [role="status"]');
    const described = () =>
      (field.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join('');
    expect(status()?.textContent).toBe('');
    expect(described()).toBe('');

    await press(field, 'a', { modifierCapsLock: true });
    expect(status()?.textContent).toBe('Caps Lock is on.');
    expect(described()).toBe('Caps Lock is on.');

    await press(field, 'CapsLock', { modifierCapsLock: false });
    expect(status()?.textContent).toBe('');
    expect(described()).toBe('');

    await press(field, 'a', { modifierCapsLock: true });
    await act(async () => {
      field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(status()?.textContent).toBe('');
  });

  it('on an empty submit shows one summary, marks the fields and moves focus to the summary', async () => {
    await mount();
    await click(getByRole(document.body, 'button', 'Sign in'));

    const summary = getByRole(document.body, 'alert');
    expect(document.activeElement).toBe(summary);
    expect(summary.textContent).toContain('Enter your email address.');
    expect(summary.textContent).toContain('Enter your password.');
    expect(getByRole(document.body, 'textbox', 'Email').getAttribute('aria-invalid')).toBe('true');
    expect(password().getAttribute('aria-invalid')).toBe('true');
    expect(document.querySelectorAll('form [aria-invalid="true"]')).toHaveLength(2);

    // a summary entry takes you to its field
    await click(getByRole(summary, 'button', 'Enter your password.'));
    expect(document.activeElement).toBe(password());

    // typing clears that field's own error
    await changeValue(password(), 'x');
    expect(password().getAttribute('aria-invalid')).toBeNull();
  });

  it('rejects a malformed email before calling the server', async () => {
    await mount();
    await changeValue(getByRole(document.body, 'textbox', 'Email'), 'nope');
    await changeValue(password(), 'pw');
    await click(getByRole(document.body, 'button', 'Sign in'));
    expect(getByRole(document.body, 'alert').textContent).toContain('Enter an email address like');
  });

  it('moves focus to the server-error summary after a failed sign-in', async () => {
    mockApi({
      user: null,
      routes: {
        'POST /api/auth/login': {
          status: 401,
          body: { ok: false, error: { code: 'invalid_credentials', message: 'Nope.' } },
        },
      },
    });
    view = await render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );
    await flush();
    await changeValue(getByRole(document.body, 'textbox', 'Email'), ADMIN.email);
    await changeValue(password(), 'wrong');
    await click(getByRole(document.body, 'button', 'Sign in'));
    await flush();

    expect(document.activeElement).toBe(getByRole(document.body, 'alert'));
  });

  it('ignores a second press while signing in', async () => {
    const api = mockApi({
      delay: true,
      user: null,
      routes: { 'POST /api/auth/login': { body: { ok: true, user: ADMIN } } },
    });
    view = await render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );
    await flush();
    await changeValue(getByRole(document.body, 'textbox', 'Email'), ADMIN.email);
    await changeValue(password(), 'pw');
    const submit = document.querySelector<HTMLButtonElement>('button[type="submit"]');
    await click(submit as HTMLButtonElement);
    await flush(1);
    await click(submit as HTMLButtonElement);
    expect(api.calls.filter((c) => c === 'POST /api/auth/login')).toHaveLength(1);
    await act(async () => {
      api.release();
    });
    await flush();
  });
});

describe('a11y LoginPage', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`a11y login · ${skin} · ${mode} · initial and error states`, async () => {
        mockApi({ user: null });
        view = await render(
          <AuthProvider>
            <LoginPage />
          </AuthProvider>,
          { skin, mode },
        );
        await flush();
        const first = await runAxe(view.container);
        expect(formatViolations(first)).toBe('');

        // the error summary, the inline errors and the Caps Lock hint all showing
        await press(password(), 'a', { modifierCapsLock: true });
        await click(getByRole(document.body, 'button', 'Sign in'));
        expect(document.querySelectorAll('form [aria-invalid="true"]').length).toBeGreaterThan(0);
        const second = await runAxe(view.container);
        expect(formatViolations(second)).toBe('');
      });
    }
  }
});
