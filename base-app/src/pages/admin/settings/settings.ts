import type { Backdrop, Skin } from '~/core/ui';

/* The settings this page edits, and the pure rules around them. */
export type ModePref = 'light' | 'dark' | 'system';

export interface Settings {
  /** Server-side (shared with everyone): saved through PUT /api/settings. */
  workspace: string;
  maintenance: boolean;
  maintenanceMessage: string;
  /** Per viewer, kept in this browser: */
  skin: Skin;
  mode: ModePref;
  backdrop: Backdrop;
}

/* What is kept in localStorage: only what the theme and backdrop hooks do not
   already keep themselves. `mode: 'system'` has to be remembered here, because
   the theme hook only knows light and dark. The workspace name and maintenance mode
   are NOT here any more: they are the server's (core/settings). */
export interface StoredSettings {
  mode: ModePref | null;
}

export const STORAGE_KEY = 'admin-settings';
export const DEFAULT_STORED: StoredSettings = { mode: null };

/** The settings that live on the server, and so are saved with one PUT. */
export const SERVER_KEYS = ['workspace', 'maintenance', 'maintenanceMessage'] as const;
export type ServerKey = (typeof SERVER_KEYS)[number];

export const WORKSPACE_MAX = 60;
export const MESSAGE_MAX = 300;

export function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** "System" is only still true if the mode now showing is what the system asks for. */
export function savedMode(stored: StoredSettings, theme: 'light' | 'dark'): ModePref {
  return stored.mode === 'system' && theme === systemTheme() ? 'system' : theme;
}

/** The fields that differ between the saved settings and the edits. */
export function changedKeys(saved: Settings, edits: Partial<Settings>): (keyof Settings)[] {
  return (Object.keys(edits) as (keyof Settings)[]).filter((k) => edits[k] !== saved[k]);
}

/** The edits left once a save of `sent` has landed: only the ones changed again while it was
    saving (a field typed into after pressing Save stays a draft instead of being wiped). */
export function keptEdits(edits: Partial<Settings>, sent: Partial<Settings>): Partial<Settings> {
  const kept: Partial<Settings> = {};
  for (const k of Object.keys(edits) as (keyof Settings)[]) {
    if (!(k in sent) || edits[k] !== sent[k]) Object.assign(kept, { [k]: edits[k] });
  }
  return kept;
}

/** Why the workspace name cannot be saved, or null. */
export function workspaceError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter a workspace name.';
  if (trimmed.length > WORKSPACE_MAX) {
    return `Use ${WORKSPACE_MAX} characters or fewer.`;
  }
  return null;
}

/** Why the maintenance message cannot be saved, or null (empty is allowed: the default text is used). */
export function messageError(message: string): string | null {
  return message.trim().length > MESSAGE_MAX ? `Use ${MESSAGE_MAX} characters or fewer.` : null;
}

/** The body of PUT /api/settings for the server-side fields that changed. */
export function serverPatch(draft: Settings, changed: readonly (keyof Settings)[]) {
  const patch: Record<string, string | boolean> = {};
  if (changed.includes('workspace')) patch['workspace.name'] = draft.workspace.trim();
  if (changed.includes('maintenance')) patch['maintenance.enabled'] = draft.maintenance;
  if (changed.includes('maintenanceMessage')) {
    patch['maintenance.message'] = draft.maintenanceMessage.trim();
  }
  return patch;
}

export const BACKDROP_LABEL: Record<string, string> = {
  tide: 'Tide',
  hive: 'Hive',
};
