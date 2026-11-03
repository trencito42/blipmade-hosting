import { useState } from 'react';
import { deleteMailDomain, get, type MailDomainView } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { DangerButton, ErrorState, LoadingBlock, SoftButton, TextInput, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../components/premium';

export default function MailDomainSettings() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [touched, setTouched] = useState(false);
  const domainState = useAsync(
    async (signal) => (await get<{ domain: MailDomainView }>(`/mail/domains/${encodeURIComponent(id)}`, undefined, signal)).domain,
    [id],
  );
  const domain = domainState.data;
  const backTo = id ? `/app/mail/domains/${encodeURIComponent(id)}` : '/app/mail';
  const dirty = Boolean(confirmation || acknowledged);
  useUnsavedChangesGuard(dirty, 'Leave this deletion review? The domain has not been deleted.');

  const remove = useAction(async () => {
    await deleteMailDomain(id);
    return true;
  });
  const exact = Boolean(domain && confirmation === domain.name);
  const submit = async () => {
    setTouched(true);
    if (!domain || !exact || !acknowledged) return;
    const deleted = await remove.run();
    if (!deleted) return;
    toast.push(`${domain.name} and its mail data were deleted.`);
    navigate('/app/mail', { replace: true });
  };

  return (
    <PageEditorShell
      eyebrow="Email domain safety"
      title="Delete email domain"
      description="Review the permanent impact before removing this domain and every mailbox and alias it contains."
      backTo={backTo}
      backLabel={domain ? `Back to ${domain.name}` : 'Back to email'}
      dirty={dirty}
      aside={domain ? (
        <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
          <h2 className="text-[16px] font-semibold text-ink">Permanent impact</h2>
          <dl className="mt-3 grid gap-3 text-[13px]">
            <div><dt className="text-ink3">Domain</dt><dd className="break-all font-mono text-ink">{domain.name}</dd></div>
            <div><dt className="text-ink3">Mailboxes deleted</dt><dd className="font-mono text-ink">{domain.mailboxes}</dd></div>
            <div><dt className="text-ink3">Aliases deleted</dt><dd className="font-mono text-ink">{domain.aliases}</dd></div>
          </dl>
          <p className="mt-4 text-[12.5px] leading-relaxed text-bad">Mail delivery stops immediately. Stored mail and configuration cannot be recovered from this interface.</p>
        </aside>
      ) : undefined}
      actions={
        <>
          <SoftButton type="button" onClick={() => navigate(backTo)} disabled={remove.pending}>Discard</SoftButton>
          <DangerButton type="button" onClick={() => void submit()} disabled={remove.pending || !exact || !acknowledged}>
            {remove.pending ? 'Deleting domain…' : 'Permanently delete domain'}
          </DangerButton>
        </>
      }
    >
      {domainState.loading ? <LoadingBlock rows={3} label="Loading domain impact" /> : domainState.error ? (
        <ErrorState title="Could not load this email domain" message={domainState.error.message} onRetry={domainState.reload} />
      ) : !domain ? (
        <ErrorState title="This email domain was not found" message="There is no owned domain to review." />
      ) : (
        <div className="grid gap-5">
          <div role="alert" className="rounded-2xl bg-bad/10 p-4 text-[13.5px] leading-relaxed text-ink2">
            This deletes <strong className="text-ink">{domain.name}</strong>, its {domain.mailboxes} mailbox(es), its {domain.aliases} alias(es), stored mail and DNS configuration. This action cannot be undone.
          </div>
          <TextInput
            label={`Type ${domain.name} to confirm`}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            error={touched && !exact ? `Enter ${domain.name} exactly.` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-3.5 text-[13.5px] text-ink2">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 size-5 accent-[var(--color-bad)]" />
            <span>I understand that mail delivery stops and the domain’s mail data is permanently removed.</span>
          </label>
          {touched && !acknowledged && <p role="alert" className="text-[12.5px] font-medium text-bad">Confirm that you understand the permanent impact.</p>}
          {remove.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{remove.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}
