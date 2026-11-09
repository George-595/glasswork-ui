import { useState } from 'react';
import { api, type NotificationKind, type NotificationPreference, useApiQuery } from '~/core/api';
import {
  Card,
  Cluster,
  Heading,
  QueryView,
  SaveBar,
  Section,
  SkeletonText,
  Stack,
  Switch,
  Text,
  toast,
} from '~/core/ui';

/* The preferences: one card per kind with two switches, in the app and by email. Changes are a
   draft until Save (the kit's SaveBar), sent as just the kinds that changed. A kind whose in-app
   channel is locked (security) shows its switch on and disabled, with the reason beside it. */
type Draft = Record<NotificationKind, { inApp: boolean; email: boolean }>;

export function PreferencesTab() {
  const query = useApiQuery(
    () => api.notificationPreferences().then((r) => r.preferences),
    'prefs',
  );
  return (
    <Section
      title="How you hear about things"
      description="Choose, for each kind of notification, whether it shows in the app, is sent by email, or both."
    >
      <QueryView query={query} what="notification preferences" loading={<SkeletonText lines={6} />}>
        {(saved) => <PreferencesForm key={JSON.stringify(saved)} saved={saved} />}
      </QueryView>
    </Section>
  );
}

function PreferencesForm({ saved: initial }: { saved: NotificationPreference[] }) {
  const [saved, setSaved] = useState(initial);
  const [edits, setEdits] = useState<Partial<Draft>>({});
  const [saving, setSaving] = useState(false);

  const current = (p: NotificationPreference) =>
    edits[p.kind] ?? { inApp: p.inApp, email: p.email };
  const changed = saved.filter((p) => {
    const c = current(p);
    return c.inApp !== p.inApp || c.email !== p.email;
  });

  function set(p: NotificationPreference, patch: Partial<{ inApp: boolean; email: boolean }>) {
    setEdits((prev) => ({ ...prev, [p.kind]: { ...current(p), ...patch } }));
  }

  async function save() {
    if (changed.length === 0 || saving) return;
    setSaving(true);
    try {
      const res = await api.saveNotificationPreferences({
        preferences: changed.map((p) => ({ kind: p.kind, ...current(p) })),
      });
      setSaved(res.preferences);
      // only what this save sent is saved now: a switch flipped while it was saving stays a draft
      const sent = edits;
      setEdits((prev) => {
        const kept: Partial<Draft> = {};
        for (const [kind, d] of Object.entries(prev) as [keyof Draft, Draft[keyof Draft]][]) {
          const was = sent[kind];
          if (!was || was.inApp !== d.inApp || was.email !== d.email) kept[kind] = d;
        }
        return kept;
      });
      toast.success('Notification preferences saved.');
      // the bar that held focus is gone: put focus somewhere stable
      document.getElementById('main')?.focus();
    } catch {
      toast.error('Could not save your preferences. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap={4}>
      {saved.map((p) => {
        const c = current(p);
        return (
          <Card key={p.kind} padding="md">
            <Stack gap={3}>
              <Stack gap={1}>
                <Heading level={3} size={4}>
                  {p.label}
                </Heading>
                <Text size="small" tone="muted">
                  {p.description}
                </Text>
              </Stack>
              <Cluster gap={6}>
                <Switch
                  label={`${p.label}: in the app`}
                  checked={c.inApp}
                  disabled={p.inAppLocked}
                  onCheckedChange={(inApp) => set(p, { inApp })}
                />
                <Switch
                  label={`${p.label}: by email`}
                  checked={c.email}
                  onCheckedChange={(email) => set(p, { email })}
                />
              </Cluster>
              {p.inAppLocked && (
                <Text size="small" tone="muted">
                  Always shown in the app, so you cannot miss one.
                </Text>
              )}
            </Stack>
          </Card>
        );
      })}
      <SaveBar
        count={changed.length}
        unit="preference"
        saveLabel="Save preferences"
        saving={saving}
        onSave={() => void save()}
        onDiscard={() => {
          setEdits({});
          document.getElementById('main')?.focus();
        }}
      />
    </Stack>
  );
}
