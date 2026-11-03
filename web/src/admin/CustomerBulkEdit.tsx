import { useState } from 'react';
import { post } from '../lib/api';
import { useAction } from '../lib/useAsync';
import { useRouter } from '../router';
import { EmptyState, PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, useAdminSession } from './Overview';

const BACK_TO = '/admin/customers';

function readSelection(): string[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem('bm.bulkCustomers') ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Add a tag to the accounts picked in the list, or take it off. The page says how many accounts it touches before it does. */
export default function CustomerBulkEdit() {
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'customers.write');
  const [ids] = useState(readSelection);
  const [tag, setTag] = useState('');
  const [done, setDone] = useState(false);
  const dirty = !done && tag !== '';
  useUnsavedChangesGuard(dirty, 'Discard this change?');
  const run = useAction(async (kind: 'add' | 'remove') => post('/admin/customers/bulk-tags', { ids, [kind]: [tag.trim()] }));
  const apply = async (kind: 'add' | 'remove') => {
    if (!(await run.run(kind))) return;
    setDone(true);
    try { sessionStorage.removeItem('bm.bulkCustomers'); } catch { /* nothing to clear */ }
    toast.push(kind === 'add' ? `The tag was added to ${ids.length} accounts.` : `The tag was taken off ${ids.length} accounts.`, 'ok');
    navigate(BACK_TO, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this change?')) navigate(BACK_TO);
  };
  const ready = mayWrite && ids.length > 0 && tag.trim() !== '' && !run.pending;
  return (
    <PageEditorShell eyebrow="Customers" title="Edit the tags of several accounts" description={ids.length ? `${ids.length} account${ids.length === 1 ? '' : 's'} picked in the list.` : 'No account is picked.'} backTo={BACK_TO} backLabel="Back to customers" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={run.pending}>Discard</SoftButton><SoftButton type="button" onClick={() => void apply('remove')} disabled={!ready}>Remove the tag</SoftButton><PrimaryButton type="button" onClick={() => void apply('add')} disabled={!ready}>Add the tag</PrimaryButton></>}>
      {ids.length === 0 ? <EmptyState title="No account is picked." description="Go back to the list and tick the accounts first." />
        : (
          <div className="grid max-w-md gap-3">
            <TextInput label="Tag" value={tag} onChange={(event) => setTag(event.target.value)} placeholder="vip" autoComplete="off" disabled={!mayWrite} />
            {!mayWrite && <p className="text-[13px] text-ink3">Your role does not allow &quot;customers.write&quot;.</p>}
            {run.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{run.error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}
