import { useState } from 'react';
import { post } from '../lib/api';
import { useAction } from '../lib/useAsync';
import { useRouter } from '../router';
import { PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { useAdminSession } from './Overview';

const BACK_TO = '/admin/services';

/**
 * Brings a server that already exists on the game panel under a customer. Only an administrator can do it. The server is
 * read from the panel, matched to a product by its egg and priced from the card; the customer is named by the id on their record.
 */
export default function ServiceImport() {
  const { navigate } = useRouter();
  const toast = useToast();
  const isAdmin = useAdminSession().staff?.role === 'ADMIN';
  const [serverId, setServerId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);
  const dirty = !done && (serverId !== '' || customerId !== '' || name !== '');
  useUnsavedChangesGuard(dirty, 'Discard this import?');
  const valid = /^\d+$/.test(serverId.trim()) && Number(serverId.trim()) > 0 && customerId.trim().length > 0;
  const send = useAction(async () =>
    post('/admin/instances/import', { pterodactylServerId: Number(serverId.trim()), userId: customerId.trim(), ...(name.trim() ? { name: name.trim() } : {}) }),
  );
  const submit = async () => {
    if (!(await send.run())) return;
    setDone(true);
    toast.push('The server is imported.', 'ok');
    navigate(BACK_TO, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this import?')) navigate(BACK_TO);
  };
  return (
    <PageEditorShell eyebrow="Services" title="Import a server" description="For a server that already exists on the game panel and is not on the platform yet. It becomes an online service of the customer you name, priced from the rate card." backTo={BACK_TO} backLabel="Back to services" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!isAdmin || !valid || send.pending}>{send.pending ? 'Importing…' : 'Import server'}</PrimaryButton></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextInput label="Panel server number" inputMode="numeric" value={serverId} onChange={(event) => setServerId(event.target.value)} disabled={!isAdmin} />
        <TextInput label="Customer id" value={customerId} onChange={(event) => setCustomerId(event.target.value)} hint="The id in the address of the customer page." disabled={!isAdmin} autoComplete="off" />
        <TextInput label="Name (optional)" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} disabled={!isAdmin} />
        {!isAdmin && <p className="text-[13px] text-ink3 sm:col-span-3">Only an administrator can import a server.</p>}
        {send.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad sm:col-span-3">{send.error}</p>}
      </div>
    </PageEditorShell>
  );
}
