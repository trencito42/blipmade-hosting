import { useMemo, useState } from 'react';
import { createAllocation, listAllocations } from '../../lib/instance-api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextInput, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../components/premium';

export default function NewAllocation() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const allocations = useAsync((signal) => listAllocations(id, signal), [id]);
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('');
  const [alias, setAlias] = useState('');
  const [touched, setTouched] = useState(false);
  const rows = allocations.data?.allocations ?? [];
  const limit = allocations.data?.limit;
  const full = limit !== undefined && rows.length >= limit;
  const backTo = `/app/instances/${encodeURIComponent(id)}/network`;
  const dirty = Boolean(ip || port || alias);
  useUnsavedChangesGuard(dirty, 'Discard this network allocation draft?');
  const duplicate = useMemo(() => rows.some((row) => row.ip === ip.trim() && row.port === Number(port)), [rows, ip, port]);
  const validIp = (value: string) => {
    if (!value) return false;
    if (value.includes(':')) return /^[0-9a-fA-F:]+$/.test(value);
    const parts = value.split('.');
    return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  };
  const ipError = touched && !ip.trim() ? 'Enter the address assigned by the provider.' : touched && !validIp(ip.trim()) ? 'Enter a valid IPv4 or IPv6 address.' : undefined;
  const parsedPort = Number(port);
  const portError = touched && !port ? 'Enter the assigned port.' : touched && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) ? 'Use a port from 1 to 65535.' : touched && duplicate ? 'This address and port are already attached.' : undefined;
  const aliasError = touched && alias.length > 80 ? 'Use at most 80 characters.' : undefined;
  const create = useAction(async () => createAllocation(id, { ip: ip.trim(), port: parsedPort, ...(alias.trim() ? { alias: alias.trim() } : {}) }));
  const submit = async () => {
    setTouched(true); if (ipError || portError || aliasError || !validIp(ip.trim()) || !Number.isInteger(parsedPort) || full) return;
    const result = await create.run(); if (!result) return;
    toast.push(`${ip.trim()}:${parsedPort} was added.`); navigate(backTo, { replace: true });
  };
  const discard = () => { if (!dirty || window.confirm('Discard this network allocation draft?')) navigate(backTo); };
  return <PageEditorShell eyebrow="Instance network" title="Add an address" description="Attach one provider allocation to this instance. The backend remains authoritative for reserved ports, conflicts and plan capacity." backTo={backTo} backLabel="Back to network" dirty={dirty}
    aside={<aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24"><h2 className="text-[16px] font-semibold text-ink">Allocation capacity</h2><p className="mt-2 text-[13px] text-ink2">{limit === undefined ? 'Loading provider limit…' : `${rows.length} of ${limit} addresses attached`}</p><p className="mt-4 text-[12.5px] leading-relaxed text-ink3">This editor does not invent a free port. Enter only an address and port assigned by the provider; the API rejects conflicts and reserved values.</p></aside>}
    actions={<><SoftButton type="button" onClick={discard} disabled={create.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={create.pending || allocations.loading || full}>{create.pending ? 'Adding address…' : 'Add address'}</PrimaryButton></>}>
    {allocations.loading ? <LoadingBlock rows={3} label="Loading network capacity" /> : allocations.error ? <ErrorState title="Could not load network allocations" message={allocations.error.message} onRetry={allocations.reload} /> : <div className="grid gap-5">{full && <p role="alert" className="rounded-2xl bg-warn/10 p-4 text-[13.5px] text-ink2">This instance already uses all {limit} address slots.</p>}<div className="grid gap-5 sm:grid-cols-2"><TextInput label="IP address" value={ip} onChange={(event) => setIp(event.target.value)} error={ipError ?? create.fieldErrors.ip} placeholder="10.77.0.11" autoComplete="off" disabled={full}/><TextInput label="Port" type="number" inputMode="numeric" value={port} onChange={(event) => setPort(event.target.value)} error={portError ?? create.fieldErrors.port} placeholder="30000" min={1} max={65535} autoComplete="off" disabled={full}/></div><TextInput label="Label (optional)" value={alias} onChange={(event) => setAlias(event.target.value)} error={aliasError ?? create.fieldErrors.alias} placeholder="bot" maxLength={80} autoComplete="off" disabled={full}/>{create.error && <p role="alert" className="rounded-2xl bg-bad/10 p-4 text-[13.5px] font-medium text-bad">{create.error}</p>}</div>}
  </PageEditorShell>;
}
