import { useMemo, useState } from 'react';
import { createDatabase, getDatabaseCredentials, listDatabases, type DatabaseCredentials } from '../../lib/instance-api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextInput, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../components/premium';

export default function NewDatabase() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const databases = useAsync((signal) => listDatabases(id, signal), [id]);
  const [name, setName] = useState('');
  const [remote, setRemote] = useState('');
  const [touched, setTouched] = useState(false);
  const [credentials, setCredentials] = useState<DatabaseCredentials | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const rows = databases.data?.databases ?? [];
  const limit = databases.data?.limit;
  const full = limit !== undefined && rows.length >= limit;
  const backTo = `/app/instances/${encodeURIComponent(id)}/databases`;
  const dirty = !acknowledged && (Boolean(name || remote) || Boolean(credentials));
  useUnsavedChangesGuard(dirty, credentials ? 'Leave before storing these database credentials?' : 'Discard this database draft?');
  const duplicate = useMemo(() => rows.some((row) => row.database === name.trim() || row.database.endsWith(`_${name.trim()}`)), [rows, name]);
  const nameError = touched && !name.trim() ? 'Enter a database name.' : touched && !/^[a-zA-Z0-9_-]+$/.test(name.trim()) ? 'Use letters, digits, underscores and dashes only.' : touched && duplicate ? 'A database with this name already exists.' : undefined;
  const create = useAction(async () => {
    const database = name.trim();
    await createDatabase(id, { database, remote: remote.trim() === '*' || !remote.trim() ? '%' : remote.trim() });
    const fresh = await listDatabases(id);
    const made = fresh.databases.find((row) => row.database === database || row.database.endsWith(`_${database}`));
    if (!made) throw new Error('The database was created, but its generated credentials are not available yet. Open the database list and retry.');
    return (await getDatabaseCredentials(id, String(made.id))).credentials;
  });
  const submit = async () => {
    setTouched(true); if (nameError || !name.trim() || full) return;
    const result = await create.run(); if (!result) return;
    setCredentials(result); setName(''); setRemote(''); toast.push('Database created. Store its credentials now.');
  };
  const finish = () => { setAcknowledged(true); navigate(backTo, { replace: true }); };
  const discard = () => { if (!dirty || window.confirm(credentials ? 'Leave before storing these database credentials?' : 'Discard this database draft?')) navigate(backTo); };
  return <PageEditorShell eyebrow="Instance database" title={credentials ? 'Database created' : 'Create a database'} description={credentials ? 'The provider generated these credentials. Copy them before returning to the database workspace.' : 'Create one database inside this instance using the provider limit and remote-access rules returned by the API.'} backTo={backTo} backLabel="Back to databases" dirty={dirty}
    aside={<aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24"><h2 className="text-[16px] font-semibold text-ink">Provider capacity</h2><p className="mt-2 text-[13px] text-ink2">{limit === undefined ? 'Loading the database limit…' : `${rows.length} of ${limit} databases used`}</p><p className="mt-4 text-[12.5px] leading-relaxed text-ink3">An empty allowed address becomes <span className="font-mono">%</span>, matching the existing API behavior. Use a specific IP or wildcard range to narrow access.</p></aside>}
    actions={credentials ? <PrimaryButton type="button" onClick={finish}>I have stored the credentials</PrimaryButton> : <><SoftButton type="button" onClick={discard} disabled={create.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={create.pending || databases.loading || full}>{create.pending ? 'Creating database…' : 'Create database'}</PrimaryButton></>}>
    {databases.loading ? <LoadingBlock rows={3} label="Loading database capacity" /> : databases.error ? <ErrorState title="Could not load databases" message={databases.error.message} onRetry={databases.reload} /> : credentials ? <div role="status" className="rounded-2xl bg-acc-bg p-4"><p className="text-[15px] font-semibold text-ink">Generated credentials</p><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-s1 p-4 font-mono text-[13px] text-ink">{`host=${credentials.host}\nport=${credentials.port}\ndatabase=${credentials.database}\nuser=${credentials.username}\npassword=${credentials.password}`}</pre><p className="mt-3 text-[12.5px] text-ink3">Credential access is audited. Do not place this password in URLs, tickets or source control.</p></div> : <div className="grid gap-5">{full && <p role="alert" className="rounded-2xl bg-warn/10 p-4 text-[13.5px] text-ink2">This instance already uses its database limit of {limit}.</p>}<TextInput label="Database name" value={name} onChange={(event) => setName(event.target.value)} error={nameError ?? create.fieldErrors.database} placeholder="shop" autoComplete="off" disabled={full}/><TextInput label="Allowed address" value={remote} onChange={(event) => setRemote(event.target.value)} error={create.fieldErrors.remote} placeholder="%" hint="Empty or * allows every address. You can also use one IP or a wildcard range such as 10.0.%." autoComplete="off" disabled={full}/>{create.error && <p role="alert" className="rounded-2xl bg-bad/10 p-4 text-[13.5px] font-medium text-bad">{create.error}</p>}</div>}
  </PageEditorShell>;
}
