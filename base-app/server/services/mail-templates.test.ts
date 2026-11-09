import { describe, expect, it } from 'vitest';
import { EMAIL_TEMPLATES, emailPalette, esc, renderEmail } from './mail-templates.ts';

const CTX = { appName: 'Acme HQ', appBaseUrl: 'https://app.example.com' };
const LINK = 'https://app.example.com/accept-invite#token=abc123';

const DATA = {
  invite: { name: 'Priya', inviterName: 'Ada Admin', link: LINK, expiresIn: '7 days' },
  password_reset: { name: 'Priya', link: LINK, expiresIn: '1 hour' },
  password_changed: { name: 'Priya', when: '12 October 2026, 10:30' },
  notification: {
    name: 'Priya',
    title: 'Your role changed',
    body: 'You are now an editor.',
    link: '/admin/users',
  },
} as const;

describe('esc', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(esc(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('every template', () => {
  for (const template of EMAIL_TEMPLATES) {
    describe(`${template}`, () => {
      const mail = renderEmail(template, { ...DATA[template] }, CTX);

      it('has a one-line subject, a plain-text part and an HTML part', () => {
        expect(mail.subject).not.toMatch(/[\r\n]/);
        expect(mail.subject.length).toBeGreaterThan(5);
        expect(mail.text).toContain('Hello Priya,');
        expect(mail.text.endsWith('\nAcme HQ')).toBe(true);
        expect(mail.html.startsWith('<!doctype html><html lang="en">')).toBe(true);
        expect(mail.html).toContain('<title>');
        expect(mail.html).toContain('<h1 ');
        expect(mail.html).toContain('role="presentation"');
      });

      it('puts the same link in both parts, so the text mail is usable alone', () => {
        const links = mail.text.match(/https?:\/\/\S+/g) ?? [];
        // every link in the text part is a link in the HTML part (a template without one has none)
        expect(links.length).toBe(template === 'password_changed' ? 0 : 1);
        for (const link of links) expect(mail.html).toContain(`href="${link}"`);
      });

      it('HTML-escapes every interpolated value', () => {
        const evil = '<script>alert(1)</script> & "quotes"';
        const data: Record<string, string> = { ...DATA[template] };
        for (const key of ['name', 'inviterName', 'title', 'body', 'expiresIn', 'when']) {
          if (key in data) data[key] = evil;
        }
        const out = renderEmail(template, data, { ...CTX, appName: evil });
        expect(out.html).not.toContain('<script>');
        expect(out.html).toContain(
          '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;',
        );
        // the plain-text part is not HTML: it keeps the characters as written
        expect(out.text).toContain(evil);
      });

      it('throws on a missing required value instead of queueing a broken email', () => {
        const [first] = Object.keys(DATA[template]).filter(
          (k) => k !== 'name' && k !== 'body' && k !== 'link',
        );
        const data: Record<string, string> = { ...DATA[template] };
        delete data[first ?? ''];
        expect(() => renderEmail(template, data, CTX)).toThrow(`needs "${first}"`);
      });
    });
  }
});

describe('subjects', () => {
  it('say who and what, and cannot be used for header injection', () => {
    expect(renderEmail('invite', { ...DATA.invite }, CTX).subject).toBe(
      'Ada Admin invited you to Acme HQ',
    );
    expect(renderEmail('password_reset', { ...DATA.password_reset }, CTX).subject).toBe(
      'Reset your Acme HQ password',
    );
    expect(renderEmail('password_changed', { ...DATA.password_changed }, CTX).subject).toBe(
      'Your Acme HQ password was changed',
    );
    expect(renderEmail('notification', { ...DATA.notification }, CTX).subject).toBe(
      'Your role changed',
    );
    const injected = renderEmail(
      'notification',
      { title: 'Hello\r\nBcc: victim@example.com' },
      CTX,
    );
    expect(injected.subject).toBe('Hello Bcc: victim@example.com');
  });
});

describe('links', () => {
  it('accepts http(s) only', () => {
    for (const link of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'ftp://x.example.com',
      'not a link',
    ]) {
      expect(() => renderEmail('invite', { ...DATA.invite, link }, CTX)).toThrow(
        /absolute http\(s\) URL/,
      );
    }
  });

  it('resolves a notification link against the base URL (hash routing)', () => {
    const at = (link: string) =>
      renderEmail(
        'notification',
        { title: 'T', link },
        { ...CTX, appBaseUrl: 'https://app.example.com/' },
      ).text;
    expect(at('/admin/users')).toContain('https://app.example.com/admin/users');
    expect(at('#/account')).toContain('https://app.example.com/account');
    expect(at('https://other.example.com/x')).toContain('https://other.example.com/x');
    expect(() => at('//evil.example.com/x')).toThrow(/absolute http\(s\) URL/); // no scheme: refused
  });

  it('keeps a quote in a link from breaking out of the attribute', () => {
    const out = renderEmail(
      'password_reset',
      {
        ...DATA.password_reset,
        link: 'https://app.example.com/reset?x="><img src=x onerror=alert(1)>',
      },
      CTX,
    );
    expect(out.html).not.toContain('"><img');
    expect(out.html).not.toContain('<img');
  });

  it('a notification without a link has no button', () => {
    const out = renderEmail('notification', { title: 'FYI', body: 'Hello there' }, CTX);
    expect(out.text).not.toMatch(/https?:\/\//);
    expect(out.html).not.toContain('<a ');
  });
});

describe('colours', () => {
  it('come from the enterprise-light roles in @apps/colors, as literal values for email clients', () => {
    const p = emailPalette();
    for (const value of Object.values(p)) expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    const html = renderEmail('invite', { ...DATA.invite }, CTX).html;
    for (const value of [p.canvas, p.surface, p.fg, p.primary, p.onPrimary, p.link]) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain('var(--');
  });
});
