import { useRef, useState } from 'react';
import { ApiError } from '~/core/api';
import { useLocalStorage, useUnsavedGuard } from '~/core/hooks';
import { useSettings } from '~/core/settings';
import {
  ConfirmDialog,
  type IconName,
  Page,
  SaveBar,
  SettingsLayout,
  SettingsSection,
  toast,
  useAppTheme,
  useBackdrop,
} from '~/core/ui';
import { AppearanceSection } from './AppearanceSection';
import { ConnectionsPanel } from './ConnectionsPanel';
import { GeneralSection } from './GeneralSection';
import {
  changedKeys,
  DEFAULT_STORED,
  keptEdits,
  messageError,
  SERVER_KEYS,
  type Settings,
  STORAGE_KEY,
  type StoredSettings,
  savedMode,
  serverPatch,
  systemTheme,
  workspaceError,
} from './settings';

/* Settings, in sections: a nav on the left and one card on the right.

   The saved settings are read from where they live: the workspace name, maintenance
   mode and its message from the server (core/settings, saved with PUT /api/settings,
   so every admin and user sees them); the skin, colour mode and backdrop from this
   browser (the theme and backdrop hooks, and localStorage for "System"). What the reader changes is kept apart
   as `edits`, only the fields they touched, so the page can say exactly what is
   unsaved, "Discard" is just emptying `edits`, and a change made elsewhere (the
   topbar's theme toggle) is never overwritten by a stale copy.

   A sticky bar appears while there is something unsaved. Leaving the tab, or
   following a link to another page, asks first (useUnsavedGuard). The
   Connections section has its own buttons and is not part of Save. */
type SectionId = 'general' | 'appearance' | 'connections';

const SECTIONS: readonly {
  id: SectionId;
  label: string;
  icon: IconName;
  title: string;
  description: string;
}[] = [
  {
    id: 'general',
    label: 'General',
    icon: 'settings',
    title: 'General',
    description:
      'The workspace’s name, and whether regular users can reach it. Saved for everyone.',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: 'sun',
    title: 'Appearance',
    description: 'The skin, the colour mode and the glass backdrop. Saved on this device.',
  },
  {
    id: 'connections',
    label: 'Connections',
    icon: 'database',
    title: 'Connections',
    description: 'Check the database and the language model are reachable.',
  },
];

export default function AdminSettingsPage() {
  const { theme, setTheme, skin, setSkin } = useAppTheme();
  const [backdrop, setBackdrop] = useBackdrop();
  const [stored, setStored] = useLocalStorage<StoredSettings>(STORAGE_KEY, DEFAULT_STORED);
  const server = useSettings();
  const [saving, setSaving] = useState(false);
  // a value the server refused, kept next to the field it belongs to until the next edit
  const [refused, setRefused] = useState<{ field: keyof Settings; message: string } | null>(null);
  const [section, setSection] = useState<SectionId>('general');
  const [edits, setEdits] = useState<Partial<Settings>>({});
  const [showErrors, setShowErrors] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);

  const saved: Settings = {
    workspace: server.workspaceName,
    maintenance: server.maintenance.enabled,
    maintenanceMessage: server.maintenance.message,
    skin,
    mode: savedMode(stored, theme),
    backdrop,
  };
  const draft: Settings = { ...saved, ...edits };
  const changed = changedKeys(saved, edits);
  const dirty = changed.length > 0;
  const nameError =
    (showErrors ? workspaceError(draft.workspace) : null) ??
    (refused?.field === 'workspace' ? refused.message : null);
  const messageProblem =
    (showErrors ? messageError(draft.maintenanceMessage) : null) ??
    (refused?.field === 'maintenanceMessage' ? refused.message : null);

  const guard = useUnsavedGuard(dirty);

  function edit(patch: Partial<Settings>) {
    setRefused(null);
    setEdits((prev) => ({ ...prev, ...patch }));
  }

  function backToHeading() {
    // The bar that held focus is gone; put focus somewhere stable, not on <body>.
    headingRef.current?.focus();
  }

  function discard() {
    setRefused(null);
    setEdits({});
    setShowErrors(false);
    backToHeading();
  }

  async function save() {
    if (!dirty || saving) return;
    if (
      workspaceError(draft.workspace) !== null ||
      messageError(draft.maintenanceMessage) !== null
    ) {
      setShowErrors(true);
      setSection('general');
      return;
    }
    // The server's settings first: if it refuses, nothing local changes either.
    const serverChanged = changed.filter((k) => (SERVER_KEYS as readonly string[]).includes(k));
    if (serverChanged.length > 0) {
      setSaving(true);
      try {
        await server.save(serverPatch(draft, serverChanged));
      } catch (err) {
        const field =
          err instanceof ApiError && err.code === 'invalid_setting'
            ? settingField(err.message)
            : null;
        if (field) {
          setRefused({ field, message: err instanceof ApiError ? err.message : '' });
          setSection('general');
        } else {
          toast.error('Couldn’t save the settings', {
            description: err instanceof ApiError ? err.message : 'Try again in a moment.',
          });
        }
        return;
      } finally {
        setSaving(false);
      }
    }
    setStored({ mode: draft.mode });
    if (draft.skin !== skin) setSkin(draft.skin);
    const nextTheme = draft.mode === 'system' ? systemTheme() : draft.mode;
    if (nextTheme !== theme) setTheme(nextTheme);
    if (draft.backdrop !== backdrop) setBackdrop(draft.backdrop);
    // only what this save sent is now saved: a field changed while it was saving stays a draft
    const sent = edits;
    setEdits((prev) => keptEdits(prev, sent));
    setShowErrors(false);
    toast.success('Settings saved.');
    backToHeading();
  }

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <Page title="Settings" eyebrow="Admin" description="Workspace, appearance and connections.">
      <SettingsLayout
        sections={SECTIONS}
        value={section}
        onValueChange={(id) => setSection(id as SectionId)}
      >
        <SettingsSection
          title={current?.title}
          description={current?.description}
          headingRef={headingRef}
        >
          {section === 'general' && (
            <GeneralSection
              workspace={draft.workspace}
              maintenance={draft.maintenance}
              maintenanceMessage={draft.maintenanceMessage}
              workspaceError={nameError}
              messageError={messageProblem}
              onWorkspace={(workspace) => edit({ workspace })}
              onMaintenance={(maintenance) => edit({ maintenance })}
              onMessage={(maintenanceMessage) => edit({ maintenanceMessage })}
              onEnter={() => void save()}
            />
          )}
          {section === 'appearance' && <AppearanceSection value={draft} onChange={edit} />}
          {section === 'connections' && <ConnectionsPanel />}
        </SettingsSection>
      </SettingsLayout>

      <SaveBar
        count={changed.length}
        unit="setting"
        saveLabel="Save changes"
        saving={saving}
        onSave={() => void save()}
        onDiscard={discard}
      />

      <ConfirmDialog
        open={guard.pending !== null}
        onClose={guard.stay}
        title="Leave without saving?"
        description="You have unsaved settings. If you leave this page they are lost."
        confirmLabel="Leave page"
        cancelLabel="Stay here"
        destructive
        onConfirm={guard.proceed}
      />
    </Page>
  );
}

/* The setting a server refusal is about: the server names the setting in its message, e.g.
   "The workspace name can be at most 60 characters." */
function settingField(message: string): keyof Settings | null {
  const text = message.toLowerCase();
  if (text.includes('workspace')) return 'workspace';
  if (text.includes('maintenance message')) return 'maintenanceMessage';
  return null;
}
