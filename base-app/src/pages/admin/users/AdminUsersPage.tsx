import { useMemo, useState } from 'react';
import {
  api,
  type InviteUserBody,
  type Role,
  type User,
  useApiAction,
  useApiQuery,
} from '~/core/api';
import { useAuth } from '~/core/auth';
import {
  Avatar,
  Badge,
  Button,
  Cluster,
  Code,
  type Column,
  ConfirmDialog,
  DetailSection,
  DetailSheet,
  downloadCsv,
  Icon,
  ListPage,
  type MenuItem,
  Page,
  Stack,
  Text,
  toast,
  useDataTable,
} from '~/core/ui';
import { formatRelative } from '~/core/utils';
import { ChangeRoleDialog } from './ChangeRoleDialog';
import { type InviteInput, InviteUserDialog } from './InviteUserDialog';
import { ROLE_LABEL, STATUS_BADGE, STATUS_LABEL } from './labels';

/* The user table, built on DataTable's own toolbar: search by name or email,
   Role and Status filters with counts, chips, a column picker and CSV. Row
   actions and the bulk bar change users through PATCH /api/users/:id; the
   server owns the rules (no self-demotion, never the last admin) and this page
   only hides what it already knows will be refused. `list` is the page's copy
   of the users: a change patches it from the server's answer at once and a
   quiet re-fetch follows, so the filters, sort and page are never thrown away
   by a skeleton. */
function isSelf(user: User, me: { id: string; email: string } | null): boolean {
  return me !== null && (user.id === me.id || user.email.toLowerCase() === me.email.toLowerCase());
}

function UserCell({ user }: { user: User }) {
  return (
    <Cluster gap={3} nowrap>
      <Avatar name={user.name} src={user.avatarUrl ?? undefined} size="sm" />
      <Stack gap={0}>
        <Text as="span" weight="semibold">
          {user.name}
        </Text>
        <Text as="span" size="small" tone="muted">
          {user.email}
        </Text>
      </Stack>
    </Cluster>
  );
}

const COLUMNS: readonly Column<User>[] = [
  {
    key: 'name',
    header: 'Name',
    sortable: true,
    searchable: true,
    searchValue: (u) => `${u.name} ${u.email}`,
    cell: (u) => <UserCell user={u} />,
    csv: (u) => u.name,
  },
  {
    key: 'email',
    header: 'Email',
    hideable: true,
    defaultHidden: true,
  },
  {
    key: 'role',
    header: 'Role',
    sortable: true,
    facet: true,
    facetLabel: (v) => ROLE_LABEL[v as Role] ?? v,
    cell: (u) => <Badge variant="neutral">{ROLE_LABEL[u.role]}</Badge>,
    csv: (u) => ROLE_LABEL[u.role],
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    facet: true,
    facetLabel: (v) => STATUS_LABEL[v as User['status']] ?? v,
    cell: (u) => {
      const s = STATUS_BADGE[u.status];
      return <Badge variant={s.variant}>{s.label}</Badge>;
    },
    csv: (u) => STATUS_LABEL[u.status],
  },
  { key: 'team', header: 'Team', hideable: true },
  {
    key: 'lastActiveAt',
    header: 'Last active',
    sortable: true,
    hideable: true,
    sortValue: (u) => (u.status === 'invited' ? 0 : Date.parse(u.lastActiveAt)),
    cell: (u) => (u.status === 'invited' ? 'Never' : formatRelative(u.lastActiveAt, new Date())),
    csv: (u) => (u.status === 'invited' ? '' : u.lastActiveAt),
  },
];

type Pending =
  | { kind: 'suspend'; users: readonly User[] }
  | { kind: 'bulk-suspend'; users: readonly User[]; skipped: number };

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const query = useApiQuery(() => api.users().then((r) => r.users), 'users');
  const [list, setList] = useState<readonly User[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Bumped on every open so the dialog starts with empty fields and no stale error.
  const [session, setSession] = useState(0);
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  // Fixed for the life of the page, so "5 minutes ago" reads the same on every render.
  const [now] = useState(() => new Date());

  const loaded = query.status === 'success' ? query.data : null;
  // The first answer becomes the page's copy (state adjusted while rendering, not in an effect).
  const [adopted, setAdopted] = useState<readonly User[] | null>(null);
  if (loaded && loaded !== adopted) {
    setAdopted(loaded);
    setList(loaded);
  }

  const table = useDataTable<User>({
    columns: COLUMNS,
    rows: list,
    rowKey: (u) => u.id,
    rowLabel: (u) => u.name,
    initialState: { pageSize: 15 },
  });
  const detail = list.find((u) => u.id === detailId) ?? null;

  function patchLocal(updated: User) {
    setList((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  // A quiet re-fetch after a change; a failure leaves the patched list as it is.
  function refresh() {
    api.users().then(
      (r) => setList(r.users),
      () => undefined,
    );
  }

  // The server assigns the id; on success the returned user goes to the top of the list.
  const invite = useApiAction(async (body: InviteUserBody) => {
    const { user } = await api.inviteUser(body);
    setList((prev) => [user, ...prev.filter((u) => u.id !== user.id)]);
    toast.success(
      body.sendWelcome
        ? `Invitation sent to ${user.email}.`
        : `Invitation added for ${user.email}. No welcome email was sent.`,
    );
    setInviteOpen(false);
    return user;
  });

  function openInvite() {
    invite.reset();
    setSession((n) => n + 1);
    setInviteOpen(true);
  }

  function closeInvite() {
    setInviteOpen(false);
    invite.reset();
  }

  function handleInvite(input: InviteInput) {
    void invite.run({
      name: input.name,
      email: input.email,
      role: input.role,
      sendWelcome: input.welcome,
    });
  }

  async function changeRole(user: User, role: Role) {
    const { user: updated } = await api.updateUser(user.id, { role });
    patchLocal(updated);
    refresh();
    toast.success(`${user.name} is now ${ROLE_LABEL[role]}.`);
  }

  async function reactivate(user: User) {
    try {
      const { user: updated } = await api.updateUser(user.id, { status: 'active' });
      patchLocal(updated);
      refresh();
      toast.success(
        updated.status === 'invited'
          ? `${user.name} can sign in again once they accept their invitation.`
          : `${user.name} was reactivated.`,
      );
    } catch (err) {
      toast.error(`Couldn’t reactivate ${user.name}.`, { description: messageOf(err) });
    }
  }

  async function resend(user: User) {
    try {
      await api.resendInvite(user.id);
      toast.success(`Invitation re-sent to ${user.email}.`);
    } catch (err) {
      toast.error(`Couldn’t re-send the invitation to ${user.email}.`, {
        description: messageOf(err),
      });
    }
  }

  async function confirmSuspend() {
    if (!pending) return;
    const targets = pending.users;
    let done = 0;
    const failures: string[] = [];
    for (const user of targets) {
      try {
        const { user: updated } = await api.updateUser(user.id, { status: 'suspended' });
        patchLocal(updated);
        done += 1;
      } catch (err) {
        failures.push(`${user.name}: ${messageOf(err)}`);
      }
    }
    refresh();
    if (pending.kind === 'bulk-suspend') table.selection.clear();
    if (done === 0 && failures.length > 0) throw new Error(failures.join(' '));
    toast.success(
      done === 1 ? `${targets[0]?.name} was suspended.` : `${done} users were suspended.`,
    );
    if (failures.length > 0) {
      toast.error(`${failures.length} could not be suspended.`, {
        description: failures.join(' '),
      });
    }
  }

  function rowActions(user: User): readonly MenuItem[] {
    if (isSelf(user, me)) return [];
    const items: MenuItem[] = [
      { id: 'role', label: 'Change role…', icon: 'user', onSelect: () => setRoleTarget(user) },
    ];
    if (user.status === 'invited') {
      items.push({ id: 'resend', label: 'Resend invite', onSelect: () => void resend(user) });
    }
    if (user.status === 'suspended') {
      items.push({ id: 'reactivate', label: 'Reactivate', onSelect: () => void reactivate(user) });
    } else {
      items.push(
        { separator: true },
        {
          id: 'suspend',
          label: 'Suspend',
          danger: true,
          onSelect: () => setPending({ kind: 'suspend', users: [user] }),
        },
      );
    }
    return items;
  }

  function askBulkSuspend(keys: ReadonlySet<string>) {
    const picked = list.filter((u) => keys.has(u.id));
    const eligible = picked.filter((u) => u.status !== 'suspended' && !isSelf(u, me));
    setPending({ kind: 'bulk-suspend', users: eligible, skipped: picked.length - eligible.length });
  }

  const counts = useMemo(() => {
    const admins = list.filter((u) => u.role === 'admin').length;
    const invitedCount = list.filter((u) => u.status === 'invited').length;
    return `${list.length} users · ${admins} admins · ${invitedCount} awaiting acceptance`;
  }, [list]);

  const confirmTitle =
    pending?.kind === 'suspend'
      ? `Suspend ${pending.users[0]?.name}?`
      : `Suspend ${pending?.users.length ?? 0} users?`;

  return (
    <Page
      title="Users"
      eyebrow="Admin"
      description={query.status === 'success' ? counts : 'Who can sign in, and what they can do.'}
      actions={
        <Button onClick={openInvite}>
          <Icon name="plus" size={15} />
          Invite user
        </Button>
      }
    >
      <ListPage
        table={table}
        caption="Users"
        search={{ label: 'Search users', placeholder: 'Search name or email' }}
        columnToggle
        toolbarActions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv('users.csv', table.visibleColumns, table.rows)}
          >
            Export CSV
          </Button>
        }
        selectable
        loading={query.status === 'loading'}
        error={
          query.status === 'error'
            ? { what: 'users', error: query.error, onRetry: query.reload }
            : null
        }
        rowActions={rowActions}
        onRowClick={(u) => setDetailId(u.id)}
        bulkActions={(keys) => (
          <Button variant="outline" size="sm" onClick={() => askBulkSuspend(keys)}>
            Suspend selected
          </Button>
        )}
        detail={
          <DetailSheet
            open={detail !== null}
            onOpenChange={(open) => !open && setDetailId(null)}
            title={detail?.name ?? 'User'}
            subtitle={detail?.email}
            badges={
              detail && (
                <>
                  <Badge variant="neutral">{ROLE_LABEL[detail.role]}</Badge>
                  <Badge variant={STATUS_BADGE[detail.status].variant}>
                    {STATUS_BADGE[detail.status].label}
                  </Badge>
                </>
              )
            }
            actions={
              detail && !isSelf(detail, me) ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRoleTarget(detail);
                      setDetailId(null);
                    }}
                  >
                    Change role…
                  </Button>
                  {detail.status === 'suspended' ? (
                    <Button
                      onClick={() => {
                        void reactivate(detail);
                        setDetailId(null);
                      }}
                    >
                      Reactivate
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      onClick={() => {
                        setPending({ kind: 'suspend', users: [detail] });
                        setDetailId(null);
                      }}
                    >
                      Suspend
                    </Button>
                  )}
                </>
              ) : undefined
            }
          >
            {detail && (
              <DetailSection
                title="Account"
                items={[
                  { term: 'Email', detail: detail.email },
                  { term: 'Role', detail: ROLE_LABEL[detail.role] },
                  { term: 'Status', detail: STATUS_LABEL[detail.status] },
                  { term: 'Team', detail: detail.team },
                  {
                    term: 'Last active',
                    detail:
                      detail.status === 'invited'
                        ? 'Never'
                        : formatRelative(detail.lastActiveAt, now),
                  },
                  { term: 'ID', detail: <Code>{detail.id}</Code> },
                ]}
              />
            )}
          </DetailSheet>
        }
      />
      <InviteUserDialog
        key={session}
        open={inviteOpen}
        onClose={closeInvite}
        onInvite={handleInvite}
        sending={invite.state.status === 'loading'}
        error={invite.state.status === 'error' ? invite.state.error : null}
      />
      <ChangeRoleDialog user={roleTarget} onClose={() => setRoleTarget(null)} onSave={changeRole} />
      <ConfirmDialog
        open={pending !== null && pending.users.length > 0}
        onClose={() => setPending(null)}
        title={confirmTitle}
        description="They are signed out straight away and cannot sign in until you reactivate them."
        confirmLabel="Suspend"
        pendingLabel="Suspending…"
        destructive
        onConfirm={confirmSuspend}
      >
        {pending?.kind === 'bulk-suspend' && pending.skipped > 0 && (
          <Text size="small" tone="muted">
            {pending.skipped} selected {pending.skipped === 1 ? 'user is' : 'users are'} left out:
            already suspended, or you.
          </Text>
        )}
      </ConfirmDialog>
    </Page>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong.';
}
