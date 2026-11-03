import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ErrorState, LoadingBlock, useToast } from '../ui-app';
import { PageEditorShell } from '../app/components/premium';
import { can, useAdminSession } from './Overview';
import { DepartmentsPanel, GuestPanel, PhotoPanel } from './Support';

/** The settings of the support, out of the inbox: your photo in the chat, the chat for visitors, and the departments. Each panel saves on its own. */
export default function SupportSettings() {
  const session = useAdminSession();
  const toast = useToast();
  const departments = useAsync((signal) => get<{ departments: Parameters<typeof DepartmentsPanel>[0]['departments'] }>('/admin/support/departments', undefined, signal), []);
  return (
    <PageEditorShell eyebrow="Support" title="Support settings" description="Each group is saved on its own and written to the audit log." backTo="/admin/support" backLabel="Back to support" actions={null}>
      {session.loading ? <LoadingBlock rows={3} label="Loading your permissions" />
        : departments.error ? <ErrorState title="The departments could not be loaded" message={departments.error.message} onRetry={departments.reload} />
        : (
          <div className="grid gap-4">
            <PhotoPanel mayEdit={can(session.staff, 'tickets.write')} />
            <GuestPanel mayEdit={can(session.staff, 'settings.write')} />
            <DepartmentsPanel departments={departments.data?.departments ?? []} canEdit={can(session.staff, 'settings.write')} reload={departments.reload} toast={toast} />
          </div>
        )}
    </PageEditorShell>
  );
}
