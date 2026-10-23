import { useEffect, useState } from 'react';
import { get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Icon } from '../icons';
import { CardList, DataTable, EmptyState, ErrorState, LoadingBlock, Panel, StatusPill, useToast } from '../ui-app';
import { DASH, LiveRegion, denseGhost, densePrimary, maskEmail, useStaffUser } from './Overview';

/**
 * Staff and permissions — GET /api/admin/staff, PUT /api/admin/staff/:userId
 *
 * Only an administrator may change permissions. A staff member sees the same
 * list read-only.
 */

interface StaffMember {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  title: string | null;
  permissions: string[];
}

export default function Staff() {
  const staff = useStaffUser();
  const toast = useToast();
  const [showEmails, setShowEmails] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});

  const state = useAsync(
    (signal) => get<{ staff: StaffMember[]; available: string[] }>('/admin/staff', undefined, signal),
    [],
  );

  useEffect(() => {
    if (!state.data?.staff) return;
    const next: Record<string, string[]> = {};
    for (const member of state.data.staff) next[member.userId] = member.permissions;
    setDrafts(next);
  }, [state.data]);

  const members = state.data?.staff ?? [];
  const available = state.data?.available ?? [];
  const mayEdit = staff?.role === 'ADMIN';

  const save = useAction(async (userId: string, permissions: string[]) => {
    return put<{ staff: { userId: string; permissions: string[] } }>(`/admin/staff/${userId}`, { permissions });
  });

  const toggle = (userId: string, permission: string, checked: boolean) => {
    setDrafts((current) => {
      const existing = current[userId] ?? [];
      const next = checked ? [...new Set([...existing, permission])] : existing.filter((value) => value !== permission);
      return { ...current, [userId]: next };
    });
  };

  const saveMember = async (member: StaffMember) => {
    const permissions = drafts[member.userId] ?? member.permissions;
    const result = await save.run(member.userId, permissions);
    if (!result) return;
    toast.push(`${member.name ?? maskEmail(member.email)} updated`, 'ok');
    state.reload();
  };

  const email = (value: string) => (showEmails ? value : maskEmail(value));

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
            ? 'Changes are saved with the permission list of that member and written to the audit log.'
            : 'Only an administrator can change permissions. You see the list read-only.'
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
                    render: (member: StaffMember) => (
                      <StatusPill status={member.role === 'admin' ? 'active' : 'pending'} label={member.role} />
                    ),
                  },
                  {
                    key: 'title',
                    header: 'Title',
                    render: (member: StaffMember) => <span className="text-ink2">{member.title ?? DASH}</span>,
                  },
                  {
                    key: 'permissions',
                    header: 'Permissions',
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
                        <button type="button" onClick={() => saveMember(member)} disabled={save.pending} className={densePrimary}>
                          {save.pending ? 'Saving…' : 'Save permissions'}
                        </button>
                      )}
                    </div>
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
    </div>
  );
}
