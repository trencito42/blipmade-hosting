import { useMemo, useState } from 'react';
import { del, get, post, put, type Domain } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { ButtonLink, ErrorState, LoadingBlock, Panel, PrimaryButton, SoftButton, StatusPill, TextInput, useToast } from '../ui-app';
import { Link } from '../router';
import { PageEditorShell, useUnsavedChangesGuard } from './components/premium';
import { DomainRecords, PLATFORM_BASE } from './Domains';

const BACK_TO = '/app/domains';
const LABEL = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** The domain of the customer, found in the list the domains page already uses. */
function useDomain(id: string) {
  const list = useAsync<{ domains: Domain[] }>((signal) => get<{ domains: Domain[] }>('/domains', undefined, signal), []);
  const domain = useMemo(() => list.data?.domains.find((row) => row.id === id), [list.data, id]);
  return { list, domain };
}

function DomainSummary({ domain }: { domain: Domain }) {
  return (
    <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
      <h2 className="break-all text-[16px] font-semibold text-ink">{domain.hostname}</h2>
      <dl className="mt-4 grid gap-3 text-[13px]">
        <div>
          <dt className="text-ink3">Instance</dt>
          <dd className="mt-0.5 break-words text-ink">{domain.instanceName}</dd>
        </div>
        <div>
          <dt className="text-ink3">Status</dt>
          <dd className="mt-0.5 text-ink">{domain.status.replace(/_/g, ' ')}</dd>
        </div>
      </dl>
    </aside>
  );
}

/** The name of an address the platform gives to an instance. The server keeps the rule of one change in seven days. */
export function EditDomainAddress() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const { list, domain } = useDomain(id);
  const current = domain ? domain.hostname.slice(0, -(PLATFORM_BASE.length + 1)) : '';
  const [draft, setDraft] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const name = draft ?? current;
  const dirty = draft !== null && draft.trim() !== current;
  useUnsavedChangesGuard(dirty, 'Discard the new address?');

  const isPlatform = Boolean(domain && (domain.platform ?? domain.hostname.toLowerCase().endsWith(`.${PLATFORM_BASE}`)));
  const wait = domain?.addressChangeAvailableAt ? new Date(domain.addressChangeAvailableAt) : null;
  const locked = wait !== null && wait.getTime() > Date.now();
  const label = name.trim().toLowerCase();
  const labelError = !LABEL.test(label) ? 'Use 3 to 40 letters, numbers and dashes. The name cannot start or end with a dash.' : undefined;
  const save = useAction(async () => put<{ domain: Domain }>(`/domains/${encodeURIComponent(id)}/address`, { name: label }));

  const submit = async () => {
    setTouched(true);
    if (!domain || !isPlatform || locked || labelError || !dirty) return;
    const result = await save.run();
    if (!result) return;
    toast.push(`The address is now ${result.domain.hostname}.`, 'ok');
    navigate(BACK_TO, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard the new address?')) navigate(BACK_TO);
  };

  return (
    <PageEditorShell
      eyebrow="Domains"
      title="Change address"
      description="The name of the address that Blipmade gives to this instance."
      backTo={BACK_TO}
      backLabel="Back to domains"
      dirty={dirty}
      aside={domain ? <DomainSummary domain={domain} /> : undefined}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={save.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={save.pending || list.loading || !isPlatform || locked || !dirty}>
            {save.pending ? 'Saving…' : 'Change address'}
          </PrimaryButton>
        </>
      }
    >
      {list.loading ? (
        <LoadingBlock rows={3} label="Loading the domain" />
      ) : list.error ? (
        <ErrorState title="Could not load your domains" message={list.error.message} onRetry={list.reload} />
      ) : !domain ? (
        <ErrorState title="Domain not found" message="It does not exist or it does not belong to this account." />
      ) : !isPlatform ? (
        <ErrorState title="This is your own domain" message="Only the addresses under apps.blipmade.com can be renamed. Delete and add the domain again to change a custom hostname." />
      ) : (
        <div className="grid gap-4">
          <p className="text-[13.5px] leading-relaxed text-ink2">
            This address belongs to Blipmade, so it needs no DNS record and no proof of ownership. The old address stops
            working as soon as the name changes, and the name can be changed once in 7 days.
          </p>
          <TextInput
            label="Address name"
            value={name}
            onChange={(event) => setDraft(event.target.value.toLowerCase())}
            disabled={locked}
            autoComplete="off"
            spellCheck={false}
            hint={`${label || 'name'}.${PLATFORM_BASE}`}
            error={touched ? labelError ?? save.fieldErrors.name : undefined}
          />
          {locked && wait && <p className="text-[13px] text-ink3">You can change it again on {wait.toISOString().slice(0, 10)}.</p>}
          {save.error && <p role="alert" className="rounded-2xl bg-bad/10 p-4 text-[13.5px] font-medium text-bad">{save.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}

/** The review before a hostname stops resolving. */
export function DeleteDomain() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const { list, domain } = useDomain(id);
  const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState(false);
  const dirty = confirmation !== '';
  useUnsavedChangesGuard(dirty, 'Discard this deletion?');
  const matches = Boolean(domain && confirmation === domain.hostname);
  const remove = useAction(async () => {
    await del(`/domains/${encodeURIComponent(id)}`);
    return true;
  });

  const submit = async () => {
    setTouched(true);
    if (!domain || !matches) return;
    const result = await remove.run();
    if (!result) return;
    toast.push('Domain deleted.', 'ok');
    navigate(BACK_TO, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this deletion?')) navigate(BACK_TO);
  };

  return (
    <PageEditorShell
      eyebrow="Domains"
      title="Delete domain"
      description="Review the effect and type the hostname to confirm."
      backTo={BACK_TO}
      backLabel="Back to domains"
      dirty={dirty}
      aside={domain ? <DomainSummary domain={domain} /> : undefined}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={remove.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={remove.pending || list.loading || !matches}>
            {remove.pending ? 'Deleting…' : 'Delete domain'}
          </PrimaryButton>
        </>
      }
    >
      {list.loading ? (
        <LoadingBlock rows={3} label="Loading the domain" />
      ) : list.error ? (
        <ErrorState title="Could not load your domains" message={list.error.message} onRetry={list.reload} />
      ) : !domain ? (
        <ErrorState title="Domain not found" message="It does not exist or it was already deleted." />
      ) : (
        <div className="grid gap-5">
          <div role="alert" className="rounded-2xl border border-bad/25 bg-bad/10 p-4">
            <h2 className="text-[14px] font-semibold text-bad">{domain.hostname} stops resolving as soon as it is deleted</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink2">
              {domain.instanceName} keeps running on its other addresses. This cannot be undone: a custom domain has to be added and verified again.
            </p>
          </div>
          <TextInput
            label={`Type “${domain.hostname}” to confirm`}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            error={touched && !matches ? `Type “${domain.hostname}” exactly.` : undefined}
            autoComplete="off"
          />
          {remove.error && <p role="alert" className="rounded-2xl bg-bad/10 p-4 text-[13.5px] font-medium text-bad">{remove.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}

/** One domain: status, records, verify, rename, delete. */
export function DomainDetail() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { list, domain } = useDomain(id);
  const verify = useAction(async () => {
    await post(`/domains/${encodeURIComponent(id)}/verify`);
    list.reload();
    toast.push('Verification started.', 'ok');
    return true;
  });
  if (list.loading && !list.data) return <LoadingBlock rows={3} label="Loading the domain" />;
  if (list.error || !domain) return <ErrorState title="Domain not found" message={list.error?.message ?? 'Not on this account.'} onRetry={list.reload} />;
  const platform = domain.platform ?? domain.hostname.toLowerCase().endsWith(`.${PLATFORM_BASE}`);
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.push(`${label} copied.`, 'ok');
    } catch {
      toast.push('Copy failed.', 'error');
    }
  };
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Link to="/app/domains" className="text-[13.5px] text-ink3 hover:text-ink">← Back to domains</Link>
      <Panel
        title={domain.hostname}
        action={<StatusPill status={domain.status === 'active' ? 'available' : domain.status === 'error' ? 'failed' : 'pending'} label={domain.status.replace(/_/g, ' ')} />}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13.5px] text-ink3">{domain.instanceName} · port {domain.targetPort}</p>
          <div className="flex flex-wrap gap-2">
            {!platform && <SoftButton onClick={() => void verify.run()} disabled={verify.pending}>{verify.pending ? 'Working…' : 'Verify'}</SoftButton>}
            {platform && <ButtonLink to={`/app/domains/${encodeURIComponent(domain.id)}/edit`} variant="soft">Change</ButtonLink>}
            <ButtonLink to={`/app/domains/${encodeURIComponent(domain.id)}/delete`} variant="danger">Delete</ButtonLink>
          </div>
        </div>
        {verify.error && <p role="alert" className="mt-3 text-[13.5px] text-bad">{verify.error}</p>}
        {!platform && <div className="mt-4"><DomainRecords domain={domain} copy={copy} /></div>}
      </Panel>
    </div>
  );
}
