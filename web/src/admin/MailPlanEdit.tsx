import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { EmptyState, ErrorState, LoadingBlock, useToast } from '../ui-app';
import { PageEditorShell } from '../app/components/premium';
import { can, useAdminSession } from './Overview';
import { AdminMailPlanForm, createMailPlan, listMailPlans, mailPlanCatalog, saveMailPlan, type MailPlanPayload } from './MailProducts';

const BACK_TO = '/admin/mail/plans';

/** A plan of hosted mail on its own page: `/new` makes one, `/:id/edit` changes one. The form keeps its own Save and Cancel. */
export default function MailPlanEdit() {
  const { id } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'mail.write');
  const state = useAsync((signal) => listMailPlans(signal), []);
  const plans = state.data?.plans ?? [];
  const plan = id ? plans.find((entry) => entry.id === id) ?? null : null;
  const save = useAction(async (body: MailPlanPayload) => (id ? saveMailPlan(id, body) : createMailPlan(body)));
  return (
    <PageEditorShell eyebrow="Mail plans" title={id ? (plan ? `Edit ${plan.name}` : 'Edit plan') : 'New plan'} description="What the plan gives to a customer, and what it costs, in the minor units the platform counts in." backTo={BACK_TO} backLabel="Back to mail plans" actions={null}>
      {(session.loading || state.loading) && !state.data ? <LoadingBlock rows={4} label="Loading the plan" />
        : state.error ? <ErrorState title="The plans could not be loaded" message={state.error.message} onRetry={state.reload} />
        : id && !plan ? <EmptyState title="Plan not found." description="It may have been deleted." />
        : !mayWrite ? <p className="text-[13px] text-ink3">Your role does not hold &quot;mail.write&quot;, so the plans are read-only for you.</p>
        : (
          <AdminMailPlanForm
            key={plan?.id ?? 'new'}
            plan={plan}
            catalog={mailPlanCatalog(plans)}
            busy={save.pending}
            error={save.error}
            onCancel={() => navigate(BACK_TO)}
            onSubmit={(body) => {
              void save.run(body).then((result) => {
                if (!result) return;
                toast.push(`${body.name} saved`, 'ok');
                navigate(BACK_TO, { replace: true });
              });
            }}
          />
        )}
    </PageEditorShell>
  );
}
