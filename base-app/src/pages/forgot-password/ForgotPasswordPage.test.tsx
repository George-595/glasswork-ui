import { afterEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { formatViolations, runAxe } from '~/test/axe';
import { changeValue, click, getByRole } from '~/test/dom';
import { mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import ForgotPasswordPage from './ForgotPasswordPage';

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
});

async function mount(routes: Parameters<typeof mockApi>[0] = {}) {
  const api = mockApi({ user: null, ...routes });
  view = await render(
    <AuthProvider>
      <ForgotPasswordPage />
    </AuthProvider>,
  );
  await flush();
  return api;
}

const email = () => getByRole(document.body, 'textbox', 'Email');
const ask = async (address: string) => {
  await changeValue(email(), address);
  await click(getByRole(document.body, 'button', 'Send reset link'));
  await flush(4);
};
const ACCEPTED = { status: 202, body: { ok: true } };

describe('ForgotPasswordPage', () => {
  it('asks for an email, focused, with a way back to sign in', async () => {
    await mount();
    expect(document.querySelector('h1')?.textContent).toBe('Forgot your password?');
    expect(document.activeElement).toBe(email());
    expect(getByRole(document.body, 'link', 'Back to sign in').getAttribute('href')).toBe('/');
  });

  it('says the same thing for every address: "if an account exists"', async () => {
    const sent: unknown[] = [];
    await mount({
      routes: {
        'POST /api/auth/forgot-password': (req) => {
          sent.push(req.body);
          return ACCEPTED;
        },
      },
    });
    await ask('real@example.com');
    const first = document.querySelector('[role="status"]')?.textContent ?? '';
    expect(first).toContain("If an account exists for real@example.com, we've emailed a link");
    expect(document.querySelector('h1')?.textContent).toBe('Check your email');
    expect(sent).toEqual([{ email: 'real@example.com' }]);

    await click(getByRole(document.body, 'button', 'Use a different email'));
    await ask('ghost@example.com');
    const second = document.querySelector('[role="status"]')?.textContent ?? '';
    expect(second).toBe(first.replace('real@example.com', 'ghost@example.com'));
  });

  it('checks the shape of the address before asking', async () => {
    const api = await mount();
    await ask('not an email');
    expect(document.body.textContent).toContain('Enter an email address like name@example.com.');
    expect(api.calls).not.toContain('POST /api/auth/forgot-password');
  });

  it('shows a rate-limit refusal and a network failure, never the success message', async () => {
    await mount({
      routes: {
        'POST /api/auth/forgot-password': {
          status: 429,
          body: {
            ok: false,
            error: {
              code: 'too_many_attempts',
              message: 'Too many attempts. Try again in a little while.',
            },
          },
        },
      },
    });
    await ask('a@example.com');
    expect(document.body.textContent).toContain('Too many attempts. Try again in a little while.');
    expect(document.querySelector('h1')?.textContent).toBe('Forgot your password?');
  });

  it('has no axe violations', async () => {
    await mount({ routes: { 'POST /api/auth/forgot-password': ACCEPTED } });
    expect(formatViolations(await runAxe())).toBe('');
    await ask('a@example.com');
    expect(formatViolations(await runAxe())).toBe('');
  });
});
