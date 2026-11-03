import { useState } from 'react';
import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../icons';
import { Link } from '../router';
import { CardList, DataTable, EmptyState, ErrorState, LoadingBlock, Panel, StatusPill } from '../ui-app';
import { DASH, LiveRegion, denseGhost, maskEmail, useAdminSession } from './Overview';

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
  const [showEmails, setShowEmails] = useState(false);
  const state = useAsync(
    (signal) => get<{ staff: StaffMember[]; available: string[] }>('/admin/staff', undefined, signal),
    [],
  );

  const members = state.data?.staff ?? [];
  const available = state.data?.available ?? [];
  const mayEdit = staff?.role === 'ADMIN';

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
                rowTo={(member: StaffMember) => `/admin/staff/${encodeURIComponent(member.userId)}/permissions/edit`}
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
                      <span className="font-mono text-[12.5px] text-ink2">{member.permissions.length} / {available.length}</span>
                    ),
                  },
                  {
                    key: 'edit',
                    header: '',
                    nowrap: true,
                    render: (member: StaffMember) => (
                      <Link to={`/admin/staff/${encodeURIComponent(member.userId)}/permissions/edit`} className={denseGhost}>{mayEdit ? 'Edit rights' : 'View rights'}</Link>
                    ),
                  },
                ]}
              />
              <CardList<StaffMember> rows={members} rowKey={(member) => member.userId}>
                {(member) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink" title={member.name ?? 'No name'}>
                          {member.name ?? 'No name'}
                        </p>
                        <p className="truncate font-mono text-[12.5px] text-ink3" title={email(member.email)}>
                          {email(member.email)}
                        </p>
                      </div>
                      <StatusPill status={member.role === 'admin' ? 'active' : 'pending'} label={member.role} />
                    </div>
                    <Link to={`/admin/staff/${encodeURIComponent(member.userId)}/permissions/edit`} className={`${denseGhost} mt-2`}>{mayEdit ? 'Edit rights' : 'View rights'}</Link>
                  </div>
                )}
              </CardList>

            </div>
          )}
        </div>
      </Panel>

    </div>
  );
}
