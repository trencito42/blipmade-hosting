import { useCallback, useMemo, useState } from 'react';
import { get, listMailDomains, post, type MailDomainView, type MailServiceView } from '../../lib/api';
import { validateMailDomainName } from '../../lib/mail-domain';
import { useAction, useAsync } from '../../lib/useAsync';
import { useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, useToast } from '../../ui-app';
import {
  AsyncCombobox,
  DomainInput,
  PageEditorShell,
  useUnsavedChangesGuard,
  type ComboboxOption,
} from '../components/premium';
import { mailDomainPath } from './shared';

interface CreatedMailDomain {
  id: string;
  name: string;
  verificationHost?: string | null;
  verificationToken?: string | null;
}

export default function NewMailDomain() {
  const { navigate } = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [serviceLabel, setServiceLabel] = useState('');
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState<CreatedMailDomain | null>(null);

  const servicesState = useAsync(
    (signal) => get<{ services: MailServiceView[] }>('/mail/services', undefined, signal),
    [],
  );
  const domainsState = useAsync((signal) => listMailDomains(signal), []);
  const services = useMemo(() => servicesState.data?.services ?? [], [servicesState.data]);
  const usable = useMemo(() => services.filter((service) => service.status !== 'CANCELLED'), [services]);
  const selectedId = serviceId || (usable.length === 1 ? usable[0]!.id : '');
  const selectedService = usable.find((service) => service.id === selectedId);
  const selectedLabel = serviceLabel || (usable.length === 1 ? usable[0]!.plan.name : '');
  const existing = useMemo(
    () => new Set((domainsState.data?.domains ?? []).map((domain: MailDomainView) => domain.name.toLowerCase())),
    [domainsState.data],
  );

  const dirty = !created && Boolean(name || serviceId);
  useUnsavedChangesGuard(dirty, 'Discard this email domain claim?');

  const loadServices = useCallback(async (query: string): Promise<ComboboxOption[]> => {
    const normalized = query.toLocaleLowerCase();
    return services
      .filter((service) => !normalized || `${service.plan.name} ${service.plan.slug}`.toLocaleLowerCase().includes(normalized))
      .map((service) => {
        const cancelled = service.status === 'CANCELLED';
        const full = service.usage.domains >= service.limits.maxDomains;
        return {
          value: service.id,
          label: service.plan.name,
          group: 'Email hosting',
          description: `${service.usage.domains} of ${service.limits.maxDomains} domains`,
          disabled: cancelled || full,
          disabledReason: cancelled ? 'This subscription is cancelled.' : full ? 'This plan has reached its domain limit.' : undefined,
        };
      });
  }, [services]);

  const create = useAction(async () => {
    const hostname = name.trim().toLowerCase();
    const answer = selectedId
      ? await post<{ domain: CreatedMailDomain }>(`/mail/services/${encodeURIComponent(selectedId)}/domains`, { name: hostname })
      : await post<{ domain: CreatedMailDomain }>('/mail/domains', { name: hostname });
    return answer.domain;
  });

  const validate = () => {
    const hostname = name.trim().toLowerCase();
    const problem = validateMailDomainName(hostname);
    if (problem) return problem;
    if (existing.has(hostname)) return 'This domain is already one of yours.';
    return undefined;
  };
  const nameError = touched ? validate() : undefined;
  const serviceError = touched && usable.length > 1 && !selectedId ? 'Choose the email plan this domain belongs to.' : undefined;

  const submit = async () => {
    setTouched(true);
    if (validate() || (usable.length > 1 && !selectedId)) return;
    const domain = await create.run();
    if (!domain) return;
    setCreated(domain);
    toast.push(`${domain.name} was added. Publish its DNS records next.`);
  };

  const discard = () => {
    if (!dirty || window.confirm('Discard this email domain claim?')) navigate('/app/mail');
  };

  const loading = servicesState.loading || domainsState.loading;
  const failure = servicesState.error ?? domainsState.error;

  return (
    <PageEditorShell
      eyebrow="Email hosting"
      title={created ? 'Email domain added' : 'Add an email domain'}
      description={created
        ? 'The claim exists. Publish the ownership proof and then open the domain for its MX, SPF and DKIM records.'
        : 'Attach one hostname to the right email subscription. Mail stays inactive until ownership and required DNS records are verified.'}
      backTo="/app/mail"
      backLabel="Back to email"
      dirty={dirty}
      aside={
        <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
          <h2 className="text-[16px] font-semibold text-ink">DNS remains under your control</h2>
          <ol className="mt-3 grid list-decimal gap-2 pl-5 text-[13px] leading-relaxed text-ink2">
            <li>Claim the exact email domain here.</li>
            <li>Publish the TXT ownership proof at your DNS provider.</li>
            <li>Open the domain and publish its MX, SPF and DKIM records.</li>
          </ol>
          {selectedService && (
            <div className="mt-4 rounded-xl bg-s2 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink3">Plan capacity</p>
              <p className="mt-1 text-[13px] text-ink">{selectedService.usage.domains} of {selectedService.limits.maxDomains} domains used</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-s3" aria-hidden="true">
                <div className="h-full rounded-full bg-acc" style={{ width: `${Math.min(100, (selectedService.usage.domains / Math.max(1, selectedService.limits.maxDomains)) * 100)}%` }} />
              </div>
            </div>
          )}
        </aside>
      }
      actions={created ? (
        <>
          <SoftButton type="button" onClick={() => navigate('/app/mail')}>Done</SoftButton>
          <PrimaryButton type="button" onClick={() => navigate(mailDomainPath(created.id))}>Open the domain</PrimaryButton>
        </>
      ) : (
        <>
          <SoftButton type="button" onClick={discard} disabled={create.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={create.pending || loading}>
            {create.pending ? 'Adding domain…' : 'Add email domain'}
          </PrimaryButton>
        </>
      )}
    >
      {loading ? <LoadingBlock rows={3} label="Loading email plans" /> : failure ? (
        <ErrorState title="Could not load email domain options" message={failure.message} onRetry={() => { servicesState.reload(); domainsState.reload(); }} />
      ) : created ? (
        <div className="grid gap-4">
          <div className="rounded-2xl bg-s1 p-5">
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink3">Ownership proof</p>
            {created.verificationHost ? (
              <dl className="mt-3 grid gap-3">
                <div><dt className="text-[12px] text-ink3">TXT host</dt><dd className="break-all font-mono text-[13px] text-ink">{created.verificationHost}</dd></div>
                <div><dt className="text-[12px] text-ink3">TXT value</dt><dd className="break-all font-mono text-[13px] text-ink">{created.verificationToken}</dd></div>
              </dl>
            ) : <p className="mt-2 text-[13px] text-ink2">No separate ownership proof was returned. Open the domain for its required mail records.</p>}
          </div>
        </div>
      ) : (
        <div className="grid gap-5">
          <DomainInput
            label="Email domain"
            value={name}
            onChange={setName}
            placeholder="example.com"
            hint="Enter the hostname without a protocol. It cannot already belong to your account."
            error={nameError ?? create.fieldErrors.hostname ?? create.fieldErrors.name ?? create.fieldErrors.domain}
          />
          {services.length > 0 && (
            <AsyncCombobox
              label="Email plan"
              value={selectedId}
              selectedLabel={selectedLabel}
              onChange={(value, option) => { setServiceId(value); setServiceLabel(option?.label ?? ''); }}
              loadOptions={loadServices}
              placeholder="Search email plans…"
              hint={usable.length === 1 ? 'Your only active email subscription is selected.' : 'The domain belongs to one subscription and counts against that plan quota.'}
              error={serviceError ?? create.fieldErrors.serviceId}
              allowClear={usable.length !== 1}
            />
          )}
          {create.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{create.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}
