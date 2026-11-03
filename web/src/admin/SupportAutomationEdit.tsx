import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { EmptyState, ErrorState, LoadingBlock, useEditorBack } from '../ui-app';
import { can, useAdminSession } from './Overview';
import { RuleEditor, blank } from './SupportAutomations';

const BACK_TO = '/admin/support/automations';

/** One automation rule on its own page: `/new` makes a rule, `/:id/edit` changes one. */
export default function SupportAutomationEdit() {
  const { id } = useParams();
  const { navigate } = useRouter();
  const session = useAdminSession();
  useEditorBack({ to: BACK_TO, label: 'Back to automations', context: 'Support automations' });
  const list = useAsync((signal) => get<{ automations: Parameters<typeof RuleEditor>[0]['rule'][] }>('/admin/support/automations', undefined, signal), []);
  const departments = useAsync((signal) => get<{ departments: { id: string; name: string }[] }>('/admin/support/departments', undefined, signal), []);
  if (session.loading || (list.loading && !list.data)) return <LoadingBlock rows={4} label="Loading the rule" />;
  if (!can(session.staff, 'tickets.read')) return <EmptyState title="No access" description="Your role does not include the support area." />;
  if (list.error) return <ErrorState title="The rule could not be loaded" message={list.error.message} onRetry={list.reload} />;
  const rule = id ? list.data?.automations.find((entry) => entry.id === id) : blank();
  if (!rule) return <ErrorState title="Rule not found" message="It was deleted." />;
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 pt-3">
      <h1 className="text-[clamp(1.5rem,2.6vw,2rem)] font-semibold tracking-[-0.04em] text-ink">{id ? 'Edit rule' : 'New rule'}</h1>
      <RuleEditor rule={rule} departments={departments.data?.departments ?? []} mayEdit={can(session.staff, 'settings.write')} onClose={() => navigate(BACK_TO)} />
    </div>
  );
}
