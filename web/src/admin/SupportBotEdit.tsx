import { useParams, useRouter } from '../router';
import { EmptyState, LoadingBlock, useEditorBack } from '../ui-app';
import { can, useAdminSession } from './Overview';
import { Editor } from './SupportBots';

const BACK_TO = '/admin/support/bots';

/** One bot on its own page: flow canvas, blocks, simulator and versions. */
export default function SupportBotEdit() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const session = useAdminSession();
  useEditorBack({ to: BACK_TO, label: 'Back to bots', context: 'Support bots' });
  if (session.loading) return <LoadingBlock rows={3} label="Loading your permissions" />;
  if (!can(session.staff, 'tickets.read')) return <EmptyState title="No access" description="Your role does not include the support area." />;
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 pt-3">
      <Editor id={id} mayEdit={can(session.staff, 'settings.write')} onClose={() => navigate(BACK_TO)} />
    </div>
  );
}
