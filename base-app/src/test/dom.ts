/* Minimal DOM helpers for tests: events and queries over querySelectorAll.
   No testing-library, on purpose (supply chain). Events go through act(). */
import { act } from 'react';

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Set a field's value the way a user would, so React's onChange fires. */
export async function changeValue(el: Element, value: string): Promise<void> {
  const field = el as Field;
  const proto = Object.getPrototypeOf(field) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => {
    setter?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export async function click(el: Element): Promise<void> {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

export async function press(el: Element, key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    );
    el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init }));
  });
}

/** The accessible name, approximately: aria-label, aria-labelledby, <label>, then text. */
export function accessibleName(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label) return label.trim();
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    return by
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
  }
  if (el.id) {
    const forLabel = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (forLabel) return (forLabel.textContent ?? '').trim();
  }
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const IMPLICIT: Record<string, string> = {
  button: 'button, input[type="button"], input[type="submit"]',
  link: 'a[href]',
  heading: 'h1, h2, h3, h4, h5, h6',
  textbox:
    'input:not([type]), input[type="text"], input[type="email"], input[type="search"], textarea',
  combobox: 'select',
  checkbox: 'input[type="checkbox"]',
  table: 'table',
  row: 'tr',
  img: 'img',
  navigation: 'nav',
  main: 'main',
  dialog: 'dialog',
};

export function getAllByRole(
  root: ParentNode,
  role: string,
  name?: string | RegExp,
): HTMLElement[] {
  const selector = [`[role="${role}"]`, IMPLICIT[role]].filter(Boolean).join(', ');
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => {
    const explicit = el.getAttribute('role');
    if (explicit && explicit !== role) return false;
    if (name === undefined) return true;
    const n = accessibleName(el);
    return typeof name === 'string' ? n === name : name.test(n);
  });
}

export function getByRole(root: ParentNode, role: string, name?: string | RegExp): HTMLElement {
  const found = getAllByRole(root, role, name);
  if (found.length !== 1) {
    throw new Error(`getByRole(${role}, ${String(name)}): expected 1 match, found ${found.length}`);
  }
  return found[0] as HTMLElement;
}

export function queryByText(root: ParentNode, text: string | RegExp): HTMLElement | null {
  const all = Array.from(root.querySelectorAll<HTMLElement>('body *, *'));
  const matches = all.filter((el) => {
    const own = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const ok = typeof text === 'string' ? own === text : text.test(own);
    // keep the innermost element whose text matches
    return (
      ok &&
      !Array.from(el.children).some((c) => {
        const t = (c.textContent ?? '').replace(/\s+/g, ' ').trim();
        return typeof text === 'string' ? t === text : text.test(t);
      })
    );
  });
  return matches[0] ?? null;
}

export function getByText(root: ParentNode, text: string | RegExp): HTMLElement {
  const el = queryByText(root, text);
  if (!el) throw new Error(`getByText(${String(text)}): no match`);
  return el;
}
