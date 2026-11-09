import { THEMES } from '@apps/colors';

/* The four emails the app sends, each rendered three ways: a subject, a plain-text body and a
   simple accessible HTML body. Pure functions of (template, data, context): no I/O, no clock.

   - Data keys per template (callers pass strings only):
       invite            name, inviterName, link, expiresIn
       password_reset    name, link, expiresIn
       password_changed  name, when
       notification      title, [name], [body], [link]   (link: absolute, or an app path such as
                                                           '/admin/users'; the old '#/admin/users' form works too)
   - A missing required key throws. The outbox renders inside the caller's transaction, so a
     wrong call fails loudly and rolls back instead of queueing a broken email.
   - HTML escapes every interpolated value (`esc`). A link is only used if it is http(s).
   - Colours: email clients ignore stylesheets and CSS variables, so the HTML is inline-styled
     tables with literal colour values. They are read from the enterprise-light roles in
     @apps/colors when a message is rendered; no colour is written in this file (check:colours
     stays clean). */

export type EmailTemplate = 'invite' | 'password_reset' | 'password_changed' | 'notification';
export const EMAIL_TEMPLATES: readonly EmailTemplate[] = [
  'invite',
  'password_reset',
  'password_changed',
  'notification',
];

export interface RenderContext {
  /** The workspace name (settings), shown in the header and footer. */
  appName: string;
  /** APP_BASE_URL, no trailing slash. Resolves a notification's in-app link. */
  appBaseUrl: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const REQUIRED: Record<EmailTemplate, readonly string[]> = {
  invite: ['name', 'inviterName', 'link', 'expiresIn'],
  password_reset: ['name', 'link', 'expiresIn'],
  password_changed: ['name', 'when'],
  notification: ['title'],
};

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
/** Escapes text for HTML content and double- or single-quoted attributes. */
export const esc = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

/** One line, for a subject or a heading: a newline in a header would be an injection. */
const oneLine = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** An absolute http(s) URL, or throws. `/path` and `#/path` are resolved against the base. */
function absoluteUrl(raw: string, base: string): string {
  const resolved = raw.startsWith('#/')
    ? `${base}${raw.slice(1)}`
    : raw.startsWith('/') && !raw.startsWith('//')
      ? `${base}${raw}`
      : raw;
  let url: URL;
  try {
    url = new URL(resolved);
  } catch {
    throw new Error('An email link must be an absolute http(s) URL or an app path.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('An email link must be an absolute http(s) URL or an app path.');
  }
  return url.href;
}

interface Palette {
  canvas: string;
  surface: string;
  fg: string;
  muted: string;
  border: string;
  primary: string;
  onPrimary: string;
  link: string;
}

/** The enterprise-light roles an email uses. Throws if a role is not a plain hex value,
    which would mean the palette changed under the template. */
export function emailPalette(): Palette {
  const roles = THEMES['enterprise-light'].roles;
  const solid = (name: keyof typeof roles): string => {
    const value = roles[name];
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Role "${name}" is not a solid colour.`);
    return value;
  };
  return {
    canvas: solid('canvas'),
    surface: solid('surface'),
    fg: solid('fg'),
    muted: solid('fg-muted'),
    border: solid('border'),
    primary: solid('primary'),
    onPrimary: solid('on-primary'),
    link: solid('link'),
  };
}

interface Body {
  subject: string;
  /** Plain-text paragraphs, in order. */
  paragraphs: string[];
  /** The one call to action. */
  action?: { label: string; url: string };
  /** A closing line under the button. */
  footnote?: string;
}

function compose(template: EmailTemplate, d: Record<string, string>, ctx: RenderContext): Body {
  const app = oneLine(ctx.appName);
  const name = oneLine(d.name ?? '');
  const hello = name ? `Hello ${name},` : 'Hello,';
  switch (template) {
    case 'invite':
      return {
        subject: `${oneLine(d.inviterName ?? '')} invited you to ${app}`,
        paragraphs: [
          hello,
          `${oneLine(d.inviterName ?? '')} has invited you to join ${app}. Choose a password to accept the invitation.`,
        ],
        action: { label: 'Accept the invitation', url: absoluteUrl(d.link ?? '', ctx.appBaseUrl) },
        footnote: `This link works once and expires in ${oneLine(d.expiresIn ?? '')}. If you were not expecting this, you can ignore the email.`,
      };
    case 'password_reset':
      return {
        subject: `Reset your ${app} password`,
        paragraphs: [
          hello,
          `We received a request to reset the password for your ${app} account. Use the button below to choose a new one.`,
        ],
        action: { label: 'Choose a new password', url: absoluteUrl(d.link ?? '', ctx.appBaseUrl) },
        footnote: `This link works once and expires in ${oneLine(d.expiresIn ?? '')}. If you did not ask for this, ignore the email: your password has not changed.`,
      };
    case 'password_changed':
      return {
        subject: `Your ${app} password was changed`,
        paragraphs: [
          hello,
          `The password for your ${app} account was changed on ${oneLine(d.when ?? '')}.`,
        ],
        footnote:
          'If this was you, there is nothing to do. If it was not, reset your password straight away and tell an administrator.',
      };
    case 'notification': {
      const paragraphs = [hello];
      if (d.body) paragraphs.push(d.body);
      return {
        subject: oneLine(d.title ?? ''),
        paragraphs,
        ...(d.link ? { action: { label: 'Open', url: absoluteUrl(d.link, ctx.appBaseUrl) } } : {}),
        footnote: `You get this email because of your notification settings in ${app}.`,
      };
    }
  }
}

function renderText(app: string, title: string, b: Body): string {
  const lines = [title, '', ...b.paragraphs.flatMap((p) => [p, ''])];
  if (b.action) lines.push(`${b.action.label}:`, b.action.url, '');
  if (b.footnote) lines.push(b.footnote, '');
  lines.push('--', app);
  return lines.join('\n');
}

function renderHtml(app: string, title: string, b: Body, p: Palette): string {
  const font = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  const paragraphs = b.paragraphs
    .map(
      (para) =>
        `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:${p.fg};">${esc(para).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
  const action = b.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr><td style="background:${p.primary};border-radius:6px;"><a href="${esc(b.action.url)}" style="display:inline-block;padding:12px 20px;${font}font-size:16px;line-height:20px;font-weight:600;color:${p.onPrimary};text-decoration:none;">${esc(b.action.label)}</a></td></tr></table>` +
      `<p style="margin:0 0 16px 0;font-size:14px;line-height:20px;color:${p.muted};">If the button does not work, copy this address into your browser:<br><a href="${esc(b.action.url)}" style="color:${p.link};word-break:break-all;">${esc(b.action.url)}</a></p>`
    : '';
  const footnote = b.footnote
    ? `<p style="margin:0 0 16px 0;font-size:14px;line-height:20px;color:${p.muted};">${esc(b.footnote)}</p>`
    : '';
  return (
    '<!doctype html>' +
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>` +
    `<body style="margin:0;padding:0;background:${p.canvas};${font}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${p.canvas};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${p.surface};border:1px solid ${p.border};border-radius:8px;"><tr><td style="padding:32px 32px 16px 32px;${font}">` +
    `<p style="margin:0 0 24px 0;font-size:14px;line-height:20px;font-weight:600;color:${p.muted};">${esc(app)}</p>` +
    `<h1 style="margin:0 0 24px 0;font-size:22px;line-height:28px;font-weight:600;color:${p.fg};">${esc(title)}</h1>` +
    paragraphs +
    action +
    footnote +
    '</td></tr></table>' +
    `<p style="margin:16px 0 0 0;${font}font-size:12px;line-height:16px;color:${p.muted};">${esc(app)}</p>` +
    '</td></tr></table></body></html>'
  );
}

/** Renders one email. Throws on a missing required key or a link that is not http(s). */
export function renderEmail(
  template: EmailTemplate,
  data: Record<string, string>,
  ctx: RenderContext,
): RenderedEmail {
  if (!EMAIL_TEMPLATES.includes(template)) throw new Error(`Unknown email template "${template}".`);
  for (const key of REQUIRED[template]) {
    if (typeof data[key] !== 'string' || data[key] === '') {
      throw new Error(`The "${template}" email needs "${key}".`);
    }
  }
  const body = compose(template, data, { ...ctx, appBaseUrl: ctx.appBaseUrl.replace(/\/+$/, '') });
  const app = oneLine(ctx.appName);
  // The heading repeats the subject without the app name where it would only echo itself.
  const title = body.subject;
  return {
    subject: body.subject.slice(0, 300),
    text: renderText(app, title, body),
    html: renderHtml(app, title, body, emailPalette()),
  };
}
