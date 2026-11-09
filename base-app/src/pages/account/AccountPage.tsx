import { useState } from 'react';
import { ApiError, api, useApiQuery } from '~/core/api';
import { useAuth } from '~/core/auth';
import { Link } from '~/core/router';
import {
  AvatarPicker,
  Button,
  buttonAttrs,
  Cluster,
  FormField,
  Input,
  NewPasswordField,
  Notice,
  Page,
  Panel,
  PasswordInput,
  QueryView,
  Section,
  SessionList,
  SkeletonText,
  Stack,
  Text,
  toast,
} from '~/core/ui';

/* The signed-in person's own account, in four sections:
   - Profile: the photo (AvatarPicker wired to PUT /api/account/avatar), the name, the email
     (read-only: an admin changes it);
   - Password: the current one, then a new one with the strength meter. The server signs out
     every other session when it changes, so the sessions list reloads;
   - Sessions: where the account is signed in (SessionList) with sign out for one or all others;
   - Notifications: a link to the preferences on the notifications page.
   Every call is about the caller; there is no user id anywhere on this page. */
function ProfileSection() {
  const { refresh } = useAuth();
  const profile = useApiQuery(() => api.account().then((r) => r.account), 'account');
  return (
    <Panel>
      <Section title="Profile" description="Your name and photo are shown to your team.">
        <QueryView query={profile} what="your profile" loading={<SkeletonText lines={4} />}>
          {(account) => (
            <ProfileForm
              key={account.id}
              initialName={account.name}
              email={account.email}
              initialAvatar={account.avatarUrl}
              onChanged={() => void refresh()}
            />
          )}
        </QueryView>
      </Section>
    </Panel>
  );
}

interface ProfileFormProps {
  initialName: string;
  email: string;
  initialAvatar: string | null;
  onChanged: () => void;
}

function ProfileForm({ initialName, email, initialAvatar, onChanged }: ProfileFormProps) {
  const [savedName, setSavedName] = useState(initialName);
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState(initialAvatar);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const saveName = async () => {
    const next = name.trim();
    if (next === '') {
      setNameError('Enter your name.');
      return;
    }
    setSaving(true);
    setNameError(undefined);
    try {
      const res = await api.updateAccount({ name: next });
      setSavedName(res.account.name);
      setName(res.account.name);
      toast.success('Profile updated');
      onChanged();
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not save your name.');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const res = await api.uploadAvatar(file);
      setAvatar(res.avatarUrl);
      onChanged();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not upload the photo.');
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    setUploading(true);
    setUploadError(null);
    try {
      await api.removeAvatar();
      setAvatar(null);
      onChanged();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not remove the photo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Stack gap={5}>
      <AvatarPicker
        name={savedName}
        src={avatar}
        uploading={uploading}
        error={uploadError}
        onSave={(file) => void upload(file)}
        onRemove={() => void remove()}
      />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!saving) void saveName();
        }}
      >
        <Stack gap={4}>
          <FormField label="Name" error={nameError}>
            <Input
              name="name"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(undefined);
              }}
            />
          </FormField>
          <FormField label="Email" description="Ask an admin if your email needs to change.">
            <Input type="email" name="email" autoComplete="email" readOnly value={email} />
          </FormField>
          <Cluster>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={name.trim() === savedName}
            >
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
          </Cluster>
        </Stack>
      </form>
    </Stack>
  );
}

function PasswordSection({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [currentError, setCurrentError] = useState<string | undefined>();
  const [nextError, setNextError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (current === '') {
      setCurrentError('Enter your current password.');
      return;
    }
    if (next === '') {
      setNextError('Choose a new password.');
      return;
    }
    setSaving(true);
    setCurrentError(undefined);
    setNextError(undefined);
    setFormError(null);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      toast.success('Password changed');
      onChanged();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      const message = err instanceof Error ? err.message : 'Could not change the password.';
      if (code === 'incorrect_password') setCurrentError(message);
      else if (code.startsWith('password_')) setNextError(message);
      else setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <Section title="Password" description="Changing it signs you out of every other device.">
        <form
          noValidate
          aria-busy={saving}
          onSubmit={(e) => {
            e.preventDefault();
            if (!saving) void submit();
          }}
        >
          <Stack gap={4}>
            {formError && <Notice tone="danger">{formError}</Notice>}
            <FormField label="Current password" error={currentError}>
              <PasswordInput
                name="current-password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => {
                  setCurrent(e.target.value);
                  setCurrentError(undefined);
                }}
              />
            </FormField>
            <NewPasswordField
              label="New password"
              name="new-password"
              value={next}
              error={nextError}
              onChange={(value) => {
                setNext(value);
                setNextError(undefined);
              }}
            />
            <Cluster>
              <Button type="submit" variant="primary" loading={saving}>
                {saving ? 'Changing…' : 'Change password'}
              </Button>
            </Cluster>
          </Stack>
        </form>
      </Section>
    </Panel>
  );
}

export default function AccountPage() {
  const sessions = useApiQuery(() => api.accountSessions().then((r) => r.sessions), 'sessions');
  const list = sessions.status === 'success' ? sessions.data : [];

  return (
    <Page title="Account" description="Your profile, password and where you're signed in.">
      <Stack gap={6}>
        <ProfileSection />
        <PasswordSection onChanged={sessions.reload} />
        <Panel>
          <Section
            title="Sessions"
            description="Every browser and device signed in to your account."
          >
            <SessionList
              sessions={list}
              loading={sessions.status === 'loading'}
              error={sessions.status === 'error' ? sessions.error : undefined}
              onRetry={sessions.reload}
              onRevoke={async (id) => {
                await api.revokeSession(id);
                sessions.reload();
              }}
              onRevokeOthers={async () => {
                await api.revokeOtherSessions();
                sessions.reload();
              }}
            />
          </Section>
        </Panel>
        <Panel>
          <Section title="Notifications">
            <Text tone="muted">Choose which events reach you in the app and by email.</Text>
            <Cluster>
              <Link to="/notifications" {...buttonAttrs('outline', 'md')}>
                Notification preferences
              </Link>
            </Cluster>
          </Section>
        </Panel>
      </Stack>
    </Page>
  );
}
