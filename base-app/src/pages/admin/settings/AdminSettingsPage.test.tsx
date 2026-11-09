import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLinkInterception } from '~/core/router';
import { SettingsProvider } from '~/core/settings';
import { Toaster, toast } from '~/core/ui';
import { formatViolations, runAxe } from '~/test/axe';
import { changeValue, click, getAllByRole, getByRole, getByText, press } from '~/test/dom';
import { locationNow } from '~/test/location';
import { mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import AdminSettingsPage from './AdminSettingsPage';
import { STORAGE_KEY } from './settings';

/* Pages stay mounted unless a test unmounts them, and a mounted dirty page keeps its
   leave-guard listeners on window and document: unmount after every test. */
let mounted: Rendered | null = null;
/* The mock server. The workspace name and maintenance mode are the server's now, so every test has
   one; a test that needs other answers calls mockApi first and renderPage keeps it. */
let api: ReturnType<typeof mockApi> | null = null;

afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
  api = null;
  act(() => toast.dismiss());
  vi.unstubAllGlobals();
});

function page() {
  return (
    <main>
      <SettingsProvider>
        <AdminSettingsPage />
      </SettingsProvider>
      <Toaster />
    </main>
  );
}

async function renderPage(
  skin: 'enterprise' | 'glass' = 'enterprise',
  mode: 'light' | 'dark' = 'light',
) {
  api ??= mockApi();
  mounted = await render(page(), { skin, mode });
  await flush();
}

const puts = () => (api?.calls ?? []).filter((c) => c === 'PUT /api/settings');

/* One reply for the two routes the Connections tests use (the database ping and the model). */
function jsonFetch(body: unknown, status = 200) {
  api = mockApi({
    routes: { 'GET /api/db/ping': { status, body }, 'POST /api/llm/complete': { status, body } },
  });
}

async function openSection(name: string) {
  await click(getByRole(document.body, 'button', name));
  await flush();
}

const saveBar = () => document.querySelector('[aria-label="Unsaved changes"]');
const workspace = () => getByRole(document.body, 'textbox', 'Workspace name') as HTMLInputElement;
const toasts = () =>
  Array.from(document.querySelectorAll('.ui-toast'))
    .map((t) => t.textContent)
    .join(' | ');
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');

async function edit(value = 'Acme HQ') {
  await changeValue(workspace(), value);
}

describe('AdminSettingsPage sections', () => {
  it('lists the sections in a nav and marks the current one', async () => {
    await renderPage();
    const nav = getByRole(document.body, 'navigation', 'Settings sections');
    const buttons = getAllByRole(nav, 'button');
    expect(buttons.map((b) => b.textContent)).toEqual(['General', 'Appearance', 'Connections']);
    expect(buttons.map((b) => b.getAttribute('aria-current'))).toEqual(['true', null, null]);
    expect(getByRole(document.body, 'heading', 'Settings')).toBeTruthy();
    expect(getByRole(document.body, 'heading', 'General')).toBeTruthy();
    await openSection('Appearance');
    expect(getByRole(document.body, 'heading', 'Appearance')).toBeTruthy();
    expect(getByRole(nav, 'button', 'Appearance').getAttribute('aria-current')).toBe('true');
  });

  it('keeps an edit when you move to another section and back', async () => {
    await renderPage();
    await edit('Acme HQ');
    await openSection('Appearance');
    await openSection('General');
    expect(workspace().value).toBe('Acme HQ');
    expect(saveBar()).not.toBeNull();
  });
});

describe('AdminSettingsPage save bar', () => {
  it('is absent until something changes, then offers Discard and Save', async () => {
    await renderPage();
    expect(saveBar()).toBeNull();
    await edit();
    const bar = saveBar() as HTMLElement;
    expect(bar.textContent).toContain('1 unsaved setting');
    expect(getByRole(bar, 'button', 'Discard')).toBeTruthy();
    expect(getByRole(bar, 'button', 'Save changes')).toBeTruthy();
  });

  it('goes away when the edit is undone by hand', async () => {
    await renderPage();
    await edit('Something else');
    await edit('Base app');
    expect(saveBar()).toBeNull();
  });

  it('Discard restores the saved values and hides the bar', async () => {
    await renderPage();
    await edit();
    await click(getByRole(document.body, 'button', 'Discard'));
    expect(saveBar()).toBeNull();
    expect(workspace().value).toBe('Base app');
    expect(stored()).toBeNull();
  });

  it('Save stores the settings, toasts and hides the bar', async () => {
    await renderPage();
    await edit('  Acme HQ  ');
    await click(getByRole(document.body, 'button', 'Save changes'));
    await flush();
    expect(api?.settings['workspace.name']).toBe('Acme HQ');
    expect(api?.settings['maintenance.enabled']).toBe(false);
    expect(stored()).toEqual({ mode: 'light' });
    expect(toasts()).toContain('Settings saved.');
    expect(saveBar()).toBeNull();
    expect(workspace().value).toBe('Acme HQ');
  });

  it('Enter in the name field saves too', async () => {
    await renderPage();
    await edit();
    await act(async () => {
      workspace().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    await flush();
    expect(api?.settings['workspace.name']).toBe('Acme HQ');
  });

  it('refuses an empty name, says why on the field and keeps the bar', async () => {
    await renderPage();
    await edit('   ');
    await click(getByRole(document.body, 'button', 'Save changes'));
    expect(workspace().getAttribute('aria-invalid')).toBe('true');
    expect(document.body.textContent).toContain('Enter a workspace name.');
    expect(saveBar()).not.toBeNull();
    expect(stored()).toBeNull();
    expect(puts()).toHaveLength(0);
    expect(toasts()).toBe('');
  });

  it('saves the maintenance switch', async () => {
    await renderPage();
    await click(getByRole(document.body, 'switch', 'Maintenance mode'));
    expect(saveBar()).not.toBeNull();
    await click(getByRole(document.body, 'button', 'Save changes'));
    expect(api?.settings['maintenance.enabled']).toBe(true);
  });
});

describe('AdminSettingsPage server settings', () => {
  it('shows the workspace name, maintenance mode and message the server holds', async () => {
    api = mockApi({
      settings: {
        'workspace.name': 'Acme HQ',
        'maintenance.enabled': true,
        'maintenance.message': 'Back at 3pm',
      },
    });
    await renderPage();
    expect(workspace().value).toBe('Acme HQ');
    expect(
      getByRole(document.body, 'switch', 'Maintenance mode').getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      (getByRole(document.body, 'textbox', 'Maintenance message') as HTMLTextAreaElement).value,
    ).toBe('Back at 3pm');
  });

  it('saves only what changed, in one PUT, and shows the new value without a reload', async () => {
    await renderPage();
    await changeValue(getByRole(document.body, 'textbox', 'Maintenance message'), 'Back at 3pm');
    await click(getByRole(document.body, 'button', 'Save changes'));
    await flush();
    expect(puts()).toHaveLength(1);
    const put = api?.fetch.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PUT',
    );
    expect(JSON.parse(String((put?.[1] as RequestInit | undefined)?.body))).toEqual({
      'maintenance.message': 'Back at 3pm',
    });
    expect(saveBar()).toBeNull();
    expect(api?.settings['maintenance.message']).toBe('Back at 3pm');
  });

  it('an edit made while a save is in flight stays a draft, not wiped by the save', async () => {
    await renderPage();
    await edit('Acme HQ');
    api?.hold();
    await click(getByRole(document.body, 'button', 'Save changes'));
    const message = getByRole(document.body, 'textbox', 'Maintenance message') as HTMLInputElement;
    await changeValue(message, 'Back at 3pm');
    api?.release();
    await flush();
    expect(api?.settings['workspace.name']).toBe('Acme HQ');
    expect(message.value).toBe('Back at 3pm');
    expect(saveBar()).not.toBeNull();
  });

  it('keeps the edit and says why when the server refuses a value', async () => {
    api = mockApi({
      routes: {
        'PUT /api/settings': {
          status: 400,
          body: {
            ok: false,
            error: {
              code: 'invalid_setting',
              message: 'The workspace name can be at most 60 characters.',
            },
          },
        },
      },
    });
    await renderPage();
    await edit('Acme HQ');
    await click(getByRole(document.body, 'button', 'Save changes'));
    await flush();
    expect(document.body.textContent).toContain('The workspace name can be at most 60 characters.');
    expect(workspace().getAttribute('aria-invalid')).toBe('true');
    expect(saveBar()).not.toBeNull();
    expect(toasts()).not.toContain('Settings saved.');
  });

  it('toasts when the save fails for another reason, and changes nothing local', async () => {
    api = mockApi({
      routes: {
        'PUT /api/settings': {
          status: 500,
          body: {
            ok: false,
            error: { code: 'internal_error', message: 'Something went wrong on the server.' },
          },
        },
      },
    });
    await renderPage();
    await openSection('Appearance');
    await click(getByRole(getByRole(document.body, 'radiogroup', 'Style'), 'radio', 'Glass'));
    await openSection('General');
    await edit('Acme HQ');
    await click(getByRole(document.body, 'button', 'Save changes'));
    await flush();
    expect(toasts()).toContain('Couldn’t save the settings');
    expect(document.documentElement.dataset.skin).toBe('enterprise');
    expect(saveBar()).not.toBeNull();
  });

  it('has a Sounds switch that is on by default, applies at once and is remembered', async () => {
    localStorage.removeItem('ui-sounds');
    await renderPage();
    await openSection('Appearance');
    const sounds = getByRole(document.body, 'switch', 'Sounds');
    expect(sounds.getAttribute('aria-checked')).toBe('true');
    expect(document.body.textContent).toContain(
      'Quiet sounds for switches, panels, messages and alerts.',
    );
    await click(sounds);
    expect(sounds.getAttribute('aria-checked')).toBe('false');
    expect(localStorage.getItem('ui-sounds')).toBe('off');
    // a pref of this device: it is not a draft, so the page is not dirty and the server hears nothing
    expect(saveBar()).toBeNull();
    expect(puts()).toHaveLength(0);
    await click(sounds);
    expect(localStorage.getItem('ui-sounds')).toBe('on');
  });

  it('a skin change alone never touches the server', async () => {
    await renderPage();
    await openSection('Appearance');
    await click(getByRole(getByRole(document.body, 'radiogroup', 'Style'), 'radio', 'Glass'));
    await click(getByRole(document.body, 'button', 'Save changes'));
    await flush();
    expect(puts()).toHaveLength(0);
    expect(document.documentElement.dataset.skin).toBe('glass');
  });
});

describe('AdminSettingsPage appearance', () => {
  it('offers Style as a two-way switch (Enterprise | Glass) and keeps the live theme until Save', async () => {
    await renderPage();
    await openSection('Appearance');
    const style = getByRole(document.body, 'radiogroup', 'Style');
    const radios = getAllByRole(style, 'radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Enterprise', 'Glass']);
    expect(radios.map((r) => r.getAttribute('data-state'))).toEqual(['on', 'off']);
    await click(radios[1] as HTMLElement);
    expect(radios.map((r) => r.getAttribute('data-state'))).toEqual(['off', 'on']);
    expect(document.documentElement.dataset.skin).toBe('enterprise');
    expect(saveBar()).not.toBeNull();
    await click(getByRole(document.body, 'button', 'Save changes'));
    expect(document.documentElement.dataset.skin).toBe('glass');
    expect(saveBar()).toBeNull();
  });

  it('Theme is a Light / Dark / System radio group that applies on Save', async () => {
    await renderPage();
    await openSection('Appearance');
    const group = getByRole(document.body, 'radiogroup', 'Theme');
    expect(getAllByRole(group, 'radio').map((r) => r.textContent)).toEqual([
      'Light',
      'Dark',
      'System',
    ]);
    await click(getByRole(group, 'radio', 'Dark'));
    expect(document.documentElement.dataset.theme).toBe('light');
    await click(getByRole(document.body, 'button', 'Save changes'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('ui-theme')).toBe('dark');
  });

  it('System resolves to the device preference and is remembered as System', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('light'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    await renderPage('enterprise', 'dark');
    await openSection('Appearance');
    await click(getByRole(getByRole(document.body, 'radiogroup', 'Theme'), 'radio', 'System'));
    await click(getByRole(document.body, 'button', 'Save changes'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(stored()?.mode).toBe('system');
    expect(
      getByRole(getByRole(document.body, 'radiogroup', 'Theme'), 'radio', 'System').getAttribute(
        'data-state',
      ),
    ).toBe('on');
  });

  it('shows every glass backdrop as a card, with its name, in one radio group', async () => {
    await renderPage();
    await openSection('Appearance');
    const radios = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="backdrop"]'),
    );
    expect(radios.map((r) => r.value)).toEqual([
      'tide',
      'hive',
      'mesh',
      'liquid-metal',
      'aurora-noise',
      'glass-caustics',
    ]);
    const labels = radios.map((r) => r.closest('label')?.textContent);
    expect(labels).toEqual([
      'Tide',
      'Hive',
      'Mesh gradient',
      'Liquid metal',
      'Soft noise',
      'Glass caustics',
    ]);
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual(['tide']);
  });

  it('choosing a backdrop saves it through the backdrop preference', async () => {
    await renderPage();
    await openSection('Appearance');
    await click(document.querySelector('input[name="backdrop"][value="mesh"]') as HTMLElement);
    expect(localStorage.getItem('ui-backdrop')).toBeNull();
    await click(getByRole(document.body, 'button', 'Save changes'));
    expect(localStorage.getItem('ui-backdrop')).toBe('mesh');
    expect(
      (document.querySelector('input[name="backdrop"][value="mesh"]') as HTMLInputElement).checked,
    ).toBe(true);
  });
});

describe('AdminSettingsPage leaving with unsaved changes', () => {
  function addLink(href: string): HTMLAnchorElement {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = 'Elsewhere';
    document.body.append(a);
    return a;
  }

  it('asks the browser before the tab closes, only while there are unsaved changes', async () => {
    await renderPage();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await edit();
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('follows a link straight away when nothing is unsaved', async () => {
    await renderPage();
    const off = installLinkInterception(); // the app shell does this for every in-app link
    try {
      await click(addLink('/users'));
    } finally {
      off();
    }
    expect(locationNow()).toBe('/users');
    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('holds a link while unsaved, and Stay here keeps the page and the edit', async () => {
    await renderPage();
    await edit();
    await click(addLink('/users'));
    await flush();
    expect(locationNow()).toBe('/');
    const dialog = document.querySelector('dialog[open]') as HTMLElement;
    expect(dialog.textContent).toContain('Leave without saving?');
    await click(getByRole(dialog, 'button', 'Stay here'));
    await flush();
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(locationNow()).toBe('/');
    expect(workspace().value).toBe('Acme HQ');
  });

  it('Leave page goes on to the link', async () => {
    await renderPage();
    await edit();
    await click(addLink('/users'));
    await flush();
    const dialog = document.querySelector('dialog[open]') as HTMLElement;
    await click(getByRole(dialog, 'button', 'Leave page'));
    await flush();
    expect(locationNow()).toBe('/users');
  });

  it('lets in-page anchors such as the skip link through', async () => {
    await renderPage();
    await edit();
    await click(addLink('#main'));
    expect(document.querySelector('dialog[open]')).toBeNull();
  });
});

describe('AdminSettingsPage connections', () => {
  it('a 200 from the database ping shows Connected with the driver and latency', async () => {
    jsonFetch({ ok: true, driver: 'sqlite', latencyMs: 3 });
    await renderPage();
    await openSection('Connections');
    await click(getByRole(document.body, 'button', 'Test connection'));
    await flush();
    expect(getByText(document.body, 'Connected')).toBeTruthy();
    const status = getAllByRole(document.body, 'status').find((el) =>
      el.textContent?.includes('sqlite'),
    );
    expect(status?.textContent).toContain('sqlite · 3 ms');
  });

  it('a failed database ping shows Unavailable with the API message', async () => {
    jsonFetch({ ok: false, error: { code: 'db_down', message: 'Database is down.' } }, 503);
    await renderPage();
    await openSection('Connections');
    await click(getByRole(document.body, 'button', 'Test connection'));
    await flush();
    expect(getByText(document.body, 'Unavailable')).toBeTruthy();
    expect(document.body.textContent).toContain('Database is down.');
  });

  it('an unconfigured model names the environment variables and nothing else', async () => {
    jsonFetch({ ok: false, error: { code: 'llm_not_configured', message: 'no key' } }, 503);
    await renderPage();
    await openSection('Connections');
    await click(getByRole(document.body, 'button', 'Send'));
    await flush();
    expect(document.body.textContent).toContain(
      'Add ANTHROPIC_API_KEY or GEMINI_API_KEY to apps/base-app/.env',
    );
  });

  it('a model answer shows the text with its provider and model', async () => {
    jsonFetch({
      ok: true,
      text: 'Hello there, friend.',
      provider: 'anthropic',
      model: 'claude-test',
      stopReason: 'end_turn',
    });
    await renderPage();
    await openSection('Connections');
    await click(getByRole(document.body, 'button', 'Send'));
    await flush();
    const region = Array.from(document.querySelectorAll('section')).find(
      (sec) => sec.querySelector('h3')?.textContent === 'Language model',
    );
    if (!region) throw new Error('no language model section');
    expect(region.textContent).toContain('Response');
    expect(region.textContent).toContain('Hello there, friend.');
    expect(region.textContent).toContain('Anthropic · claude-test');
  });
});

describe('the language-model card', () => {
  it('sends the chosen provider and the max tokens from the number field', async () => {
    api = mockApi({
      routes: {
        'POST /api/llm/complete': {
          body: {
            ok: true,
            text: 'Hello there, friend.',
            provider: 'gemini',
            model: 'gemini-test',
            stopReason: 'end_turn',
          },
        },
      },
    });
    await renderPage();
    await openSection('Connections');
    const gemini = document.querySelector('input[type="radio"][value="gemini"]') as HTMLElement;
    await click(gemini);
    const tokens = getByRole(document.body, 'spinbutton', 'Max response tokens');
    expect(tokens.getAttribute('aria-valuenow')).toBe('256');
    await press(tokens, 'ArrowUp');
    await press(tokens, 'ArrowUp');
    expect(tokens.getAttribute('aria-valuenow')).toBe('288');
    await click(getByRole(document.body, 'button', 'Send'));
    await flush();
    const call = api?.fetch.mock.calls.find((c) => String(c[0]).endsWith('/llm/complete'));
    expect(
      JSON.parse(String((call?.[1] as { body?: string } | undefined)?.body ?? '{}')),
    ).toMatchObject({ provider: 'gemini', maxTokens: 288 });
  });

  it('copies the answer', async () => {
    jsonFetch({
      ok: true,
      text: 'Hello there, friend.',
      provider: 'anthropic',
      model: 'claude-test',
      stopReason: 'end_turn',
    });
    const writeText = vi.fn<(t: string) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await renderPage();
    await openSection('Connections');
    await click(getByRole(document.body, 'button', 'Send'));
    await flush();
    await click(getByRole(document.body, 'button', 'Copy response'));
    await flush();
    expect(writeText).toHaveBeenCalledWith('Hello there, friend.');
    expect(document.body.textContent).toContain('Copied to clipboard');
  });
});

describe('a11y settings', () => {
  const passes = [
    ['enterprise', 'light'],
    ['enterprise', 'dark'],
    ['glass', 'light'],
    ['glass', 'dark'],
  ] as const;

  for (const [skin, mode] of passes) {
    it(`general · ${skin} · ${mode}`, async () => {
      await renderPage(skin, mode);
      expect(formatViolations(await runAxe())).toBe('');
    });

    it(`appearance · ${skin} · ${mode}`, async () => {
      await renderPage(skin, mode);
      await openSection('Appearance');
      expect(formatViolations(await runAxe())).toBe('');
    });

    it(`connections · ${skin} · ${mode}`, async () => {
      await renderPage(skin, mode);
      await openSection('Connections');
      expect(formatViolations(await runAxe())).toBe('');
    });

    it(`with unsaved changes and an error · ${skin} · ${mode}`, async () => {
      await renderPage(skin, mode);
      await edit('');
      await click(getByRole(document.body, 'button', 'Save changes'));
      expect(formatViolations(await runAxe())).toBe('');
    });

    it(`with the leave dialog open · ${skin} · ${mode}`, async () => {
      await renderPage(skin, mode);
      await edit();
      const a = document.createElement('a');
      a.href = '/users';
      a.textContent = 'Elsewhere';
      document.body.append(a);
      await click(a);
      await flush();
      expect(document.querySelector('dialog[open]')).not.toBeNull();
      expect(formatViolations(await runAxe())).toBe('');
    });
  }
});
