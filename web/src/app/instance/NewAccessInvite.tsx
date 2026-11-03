import { InfoTip } from '../../tooltip';
import { useState } from 'react';
import { post } from '../../lib/api';
import { useAction } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { PrimaryButton, Select, SoftButton, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../components/premium';

const day = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export default function NewAccessInvite() {
  const { id = '' } = useParams(); const { navigate } = useRouter(); const toast = useToast(); const [role, setRole] = useState<'viewer' | 'manager'>('viewer'); const [made, setMade] = useState<{ code: string; expiresAt: string } | null>(null);
  const backTo = `/app/instances/${encodeURIComponent(id)}/access`; const dirty = role !== 'viewer' && !made; useUnsavedChangesGuard(dirty, 'Discard this access invitation?');
  const create = useAction(async () => post<{ code: string; expiresAt: string }>(`/instances/${encodeURIComponent(id)}/access`, { role }));
  const submit = async () => { const answer = await create.run(); if (answer) setMade(answer); };
  const copy = async () => { try { await navigator.clipboard.writeText(made?.code ?? ''); toast.push('Access code copied.', 'ok'); } catch { toast.push('Copy failed. Select and copy the code manually.', 'error'); } };
  return <PageEditorShell eyebrow="Instance access" title="Invite someone" description="Create a single-use code for another Blipmade account, with only the role you select." backTo={backTo} backLabel="Back to access" dirty={dirty}
    aside={<aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24"><h2 className="flex items-center gap-1.5 text-[16px] font-semibold text-ink">Owner-only controls<InfoTip text="Billing, renaming, plan changes and cancellation always stay with the owner." /></h2><p className="mt-3 text-[12.5px] leading-relaxed text-ink3">Codes work once and expire automatically. Cancel an unused code from the access list.</p></aside>}
    actions={made ? <PrimaryButton type="button" onClick={() => navigate(backTo, { replace: true })}>Done</PrimaryButton> : <><SoftButton type="button" onClick={() => navigate(backTo)} disabled={create.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={create.pending}>{create.pending ? 'Creating…' : 'Create access code'}</PrimaryButton></>}>
    {made ? <div role="status" className="rounded-2xl border border-ok/25 bg-ok/10 p-5"><h2 className="text-[15px] font-semibold text-ink">Copy this one-time code now</h2><p className="mt-2 text-[13px] text-ink2">It works once and expires {day(made.expiresAt)}.</p><code className="mt-4 block break-all rounded-xl bg-card p-4 text-center font-mono text-[19px] tracking-widest text-ink">{made.code}</code><SoftButton type="button" className="mt-4" onClick={() => void copy()}>Copy code</SoftButton></div> : <div className="grid gap-5"><Select label="Role" value={role} onChange={(event) => setRole(event.target.value as 'viewer' | 'manager')}><option value="viewer">Viewer — can inspect</option><option value="manager">Manager — can inspect and run</option></Select><div className="grid gap-3 sm:grid-cols-2"><div className={`rounded-2xl border p-4 ${role === 'viewer' ? 'border-acc bg-acc/5' : 'border-line'}`}><h2 className="text-[14px] font-semibold text-ink">Viewer</h2><p className="mt-1 text-[13px] text-ink3">Can read console output, files and activity.</p></div><div className={`rounded-2xl border p-4 ${role === 'manager' ? 'border-acc bg-acc/5' : 'border-line'}`}><h2 className="text-[14px] font-semibold text-ink">Manager</h2><p className="mt-1 text-[13px] text-ink3">Viewer permissions plus power and operational controls.</p></div></div>{create.error && <p role="alert" className="rounded-2xl bg-bad/10 p-4 text-[13.5px] font-medium text-bad">{create.error}</p>}</div>}
  </PageEditorShell>;
}
