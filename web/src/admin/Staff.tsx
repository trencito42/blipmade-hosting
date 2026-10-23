import { useEffect, useState } from 'react';
import { get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Icon } from '../icons';
import { CardList, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, LoadingBlock, Panel, StatusPill, useToast } from '../ui-app';
import { DASH, LiveRegion, denseGhost, densePrimary, denseSelect, maskEmail, useAdminSession } from './Overview';

/**
 * Staff and permissions — GET /api/admin/staff, PUT /api/admin/staff/:userId
 *
 * The role of an account decides what it may do, so the server asks for the
 * role of an administrator when a role is given or taken away, and when the
 * permission list of an administrator is changed. The screen says the same, so
 * the interface and the server speak about one thing.
 */

interface StaffMember {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  title: string | null;
  permissions: string[];
}

/** The roles the server accepts. */
const ROLES = [
  { value: 'STAFF', label: 'Staff' },
  { value: 'ADMIN', label: 'Administrator' },
];

export default function Staff() {
  const session = useAdminSession();
  const staff = session.staff;
  const toast = useToast();
  const [showEmails, setShowEmails] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<StaffMember | null>(null);

  const state = useAsync(
    (signal) => get<{ staff: StaffMember[]; available: string[] }>('/admin/staff', undefined, signal),
    [],
  );

  useEffect(() => {
    if (!state.data?.staff) return;
    const next: Record<string, string[]> = {};
    const nextRoles: Record<string, string> = {};
    for (const member of state.data.staff) {
      next[member.userId] = member.permissions;
      nextRoles[member.userId] = member.role.toUpperCase();
    }
    setDrafts(next);
    setRoles(nextRoles);
  }, [state.data]);

  const members = state.data?.staff ?? [];
  const available = state.data?.available ?? [];
  const mayEdit = staff?.role === 'ADMIN';

  const save = useAction(async (userId: string, permissions: string[], role?: string) => {
    return put<{ staff: { userId: string; permissions: string[] } }>(`/admin/staff/${userId}`, {
      permissions,
      ...(role ? { role } : {}),
    });
  });

  const toggle = (userId: string, permission: string, checked: boolean) => {
    setDrafts((current) => {
      const existing = current[userId] ?? [];
      const next = checked ? [...new Set([...existing, permission])] : existing.filter((value) => value !== permission);
      return { ...current, [userId]: next };
    });
  };

  /** The lines the confirmation shows: what the member gains and what it loses. */
  const changesOf = (member: StaffMember): string[] => {
    const lines: string[] = [];
    const current = member.permissions;
    const next = drafts[member.userId] ?? member.permissions;
    const added = next.filter((permission) => !current.includes(permission));
    const removed = current.filter((permission) => !next.includes(permission));
    if (added.length) lines.push(`${member.name ?? member.email} gains ${added.join(', ')}.`);
    if (removed.length) lines.push(`${member.name ?? member.email} loses ${removed.join(', ')}.`);
    const role = roles[member.userId] ?? member.role.toUpperCase();
    if (role !== member.role.toUpperCase()) {
      lines.push(
        role === 'ADMIN'
          ? `${member.name ?? member.email} becomes an administrator and holds every permission.`
          : `${member.name ?? member.email} is no longer an administrator.`,
      );
    }
    return lines;
  };

  const confirmSave = async () => {
    if (!saving) return;
    const permissions = drafts[saving.userId] ?? saving.permissions;
    const role = roles[saving.userId] ?? saving.role.toUpperCase();
    const result = await save.run(saving.userId, permissions, role === saving.role.toUpperCase() ? undefined : role);
    if (!result) return;
    toast.push(`${saving.name ?? maskEmail(saving.email)} updated`, 'ok');
    setSaving(null);
    state.reload();
  };

  const email = (value: string) => (showEmails ? value : maskEmail(value));

  if (session.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={3} label="Loading your permissions" />
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="grid gap-4">
        <ErrorState title="The session could not be read" message={session.error} onRetry={session.reload} />
      </div>
    );
  }

  const permissionGrid = (member: StaffMember, editable: boolean) => (
    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {available.map((permission) => {
        const checked = (drafts[member.userId] ?? member.permissions).includes(permission);
        const id = `permission-${member.userId}-${permission.replace(/\./g, '-')}`;
        return (
          <label
            key={permission}
            htmlFor={id}
            className="flex min-h-[38px] items-center gap-2 rounded-xl bg-s3 px-3 py-1.5 text-[13px] text-ink"
          >
            <input
              id={id}
              type="checkbox"
              checked={checked}
              disabled={!editable}
              onChange={(event) => toggle(member.userId, permission, event.target.checked)}
              className="size-4 shrink-0 accent-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            />
            <span className="min-w-0 font-mono text-[12px] break-all text-ink2">{permission}</span>
          </label>
        );
      })}
    </div>
  );

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${members.length} staff member${members.length === 1 ? '' : 's'}`} />
      <Panel
        title="Staff and permissions"
        description={
          mayEdit
            ? 'Changes are saved with the permission list of that member and written to the audit log. Giving or taking away the role of an administrator, and changing the permissions of an administrator, are the business of an administrator.'
            : 'Only an administrator can change a role or the permissions of an administrator. You see the list read-only.'
        }
        actionBelow
        action={
          <button
            type="button"
            aria-pressed={showEmails}
            onClick={() => setShowEmails((value) => !value)}
            title="Revealing addresses is a local view change. The API has no endpoint that records a reveal."
            className={showEmails ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}
          >
            <Icon name={showEmails ? 'eyeOff' : 'eye'} size={16} />
            {showEmails ? 'Mask e-mails' : 'Show e-mails'}
          </button>
        }
      >
        <div className="grid gap-3">
          {state.loading ? (
            <LoadingBlock rows={3} label="Loading the staff list" />
          ) : state.error ? (
            <ErrorState title="The staff list could not be loaded" message={state.error.message} onRetry={state.reload} />
          ) : !members.length ? (
            <EmptyState title="No staff members." description="Staff accounts appear here once they exist." />
          ) : (
            <div className="grid gap-3">
              <DataTable<StaffMember>
                rows={members}
                rowKey={(member) => member.userId}
                columns={[
                  {
                    key: 'member',
                    header: 'Member',
                    truncate: true,
                    render: (member: StaffMember) => (
                      <span className="block min-w-0">
                        <span className="block truncate font-bold tracking-[-0.02em] text-ink" title={member.name ?? 'No name'}>
                          {member.name ?? 'No name'}
                        </span>
                        <span className="block truncate font-mono text-[12.5px] text-ink3" title={email(member.email)}>
                          {email(member.email)}
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: 'role',
                    header: 'Role',
                    nowrap: true,
                    render: (member: StaffMember) => (
                      <StatusPill status={member.role === 'admin' ? 'active' : 'pending'} label={member.role} />
                    ),
                  },
                  {
                    key: 'title',
                    header: 'Title',
                    truncate: true,
                    render: (member: StaffMember) => <span className="text-ink2">{member.title ?? DASH}</span>,
                  },
                  {
                    key: 'permissions',
                    header: 'Permissions',
                    truncate: true,
                    render: (member: StaffMember) => (
                      <span className="font-mono text-[12.5px] text-ink2">
                        {(drafts[member.userId] ?? member.permissions).length} / {available.length}
                      </span>
                    ),
                  },
                ]}
              />
              <CardList<StaffMember> rows={members} rowKey={(member) => member.userId}>
                {(member) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={member.name ?? 'No name'}>
                          {member.name ?? 'No name'}
                        </p>
                        <p className="truncate font-mono text-[12.5px] text-ink3" title={email(member.email)}>
                          {email(member.email)}
                        </p>
                      </div>
                      <StatusPill status={member.role === 'admin' ? 'active' : 'pending'} label={member.role} />
                    </div>
                  </div>
                )}
              </CardList>

              <div className="grid gap-3">
                {members.map((member) => (
                  <div key={member.userId} className="rounded-2xl bg-s2 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="w-0 min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={member.name ?? 'No name'}>
                          {member.name ?? 'No name'}
                        </p>
                        <p
                          className="truncate font-mono text-[12.5px] text-ink3"
                          title={`${email(member.email)} · ${member.role}${member.title ? ` · ${member.title}` : ''}`}
                        >
                          {email(member.email)} · {member.role}
                          {member.title ? ` · ${member.title}` : ''}
                        </p>
                      </div>
                      {mayEdit && (
                        <button type="button" onClick={() => setSaving(member)} disabled={save.pending} className={densePrimary}>
                          {save.pending ? 'Saving…' : 'Save permissions'}
                        </button>
                      )}
                    </div>
                    {mayEdit && (
                      <div className="mb-3 max-w-[280px]">
                        <Field label="Role" htmlFor={`role-${member.userId}`}>
                          <select
                            id={`role-${member.userId}`}
                            value={roles[member.userId] ?? member.role.toUpperCase()}
                            onChange={(event) =>
                              setRoles((current) => ({ ...current, [member.userId]: event.target.value }))
                            }
                            className={denseSelect}
                          >
                            {ROLES.map((role) => (
                              <option key={role.value} value={role.value}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    )}
                    {permissionGrid(member, mayEdit)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {save.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
              {save.error}
            </p>
          )}
        </div>
      </Panel>

      <ConfirmDialog
        open={saving !== null}
        title={`Save the rights of ${saving?.name ?? maskEmail(saving?.email ?? '')}`}
        description={
          saving
            ? changesOf(saving).join(' ') || 'Nothing changes. The permission list and the role stay as they are.'
            : undefined
        }
        confirmLabel="Save permissions"
        onConfirm={confirmSave}
        onCancel={() => setSaving(null)}
        busy={save.pending}
      />
    </div>
  );
}
