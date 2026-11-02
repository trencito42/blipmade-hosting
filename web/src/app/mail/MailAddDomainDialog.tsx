/**
 * The dialog of a new email domain.
 *
 * The name of the domain is checked before it is sent, the limits of the
 * plan are told before it is sent, and the steps that follow the creation
 * are shown after it: the record of the proof of ownership and the way to
 * the page of the domain, where the records of mail are shown.
 *
 * The domain is added to the plan of the customer when there is one, so the
 * domains of two subscriptions never end up in the same place.
 */

import { useEffect, useMemo, useState } from 'react';
import { post, type MailServiceView } from '../../lib/api';
import { validateMailDomainName } from '../../lib/mail-domain';
import { useAction } from '../../lib/useAsync';
import { useRouter } from '../../router';
import { PrimaryButton, Select, SoftButton, TextInput, useToast } from '../../ui-app';
import { MailDialog } from './MailDialog';
import { mailDomainPath } from './shared';

/** What the server answers when a domain was created. */
interface CreatedDomain {
  id: string;
  name: string;
  verificationHost?: string | null;
  verificationToken?: string | null;
}

export function MailAddDomainDialog({
  open,
  services,
  existingDomains,
  onClose,
  onAdded,
}: {
  open: boolean;
  /** The subscriptions of the customer: the domain belongs to one of them. */
  services: MailServiceView[];
  /** The names of the domains the customer already has. */
  existingDomains: string[];
  /** The customer closed the dialog. */
  onClose: () => void;
  /** A domain was created: the lists of the page are read again. */
  onAdded: (domain: CreatedDomain) => void;
}) {
  const { push } = useToast();
  const { navigate } = useRouter();
  const [name, setName] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedDomain | null>(null);

  // The plans that can still take a domain.
  const usable = useMemo(() => services.filter((service) => service.status !== 'CANCELLED'), [services]);
  // The plan of the domain is chosen here, and there is only one to choose
  // when the customer has one plan.
  const chosenId = serviceId || (usable.length === 1 ? usable[0]!.id : '');

  const create = useAction(async (hostname: string, service: string) => {
    if (service) {
      const answer = await post<{ domain: CreatedDomain }>(`/mail/services/${encodeURIComponent(service)}/domains`, {
        name: hostname,
      });
      return answer.domain;
    }
    const answer = await post<{ domain: CreatedDomain }>('/mail/domains', { name: hostname });
    return answer.domain;
  });

  useEffect(() => {
    if (!open) return;
    setName('');
    setError(null);
    setCreated(null);
    setServiceId('');
  }, [open]);

  const service = useMemo(() => usable.find((entry) => entry.id === chosenId) ?? null, [usable, chosenId]);
  const full = service ? service.usage.domains >= service.limits.maxDomains : false;

  const submit = async () => {
    const hostname = name.trim().toLowerCase();
    const problem = validateMailDomainName(hostname);
    if (problem) {
      setError(problem);
      return;
    }
    if (existingDomains.includes(hostname)) {
      setError('This domain is already one of yours.');
      return;
    }
    if (usable.length > 1 && !chosenId) {
      setError('Choose the plan the domain belongs to.');
      return;
    }
    if (full) {
      setError(
        `Your plan holds ${service?.limits.maxDomains ?? 0} domain(s) and it already holds ${
          service?.usage.domains ?? 0
        }. Remove one or change the plan before adding another.`,
      );
      return;
    }
    setError(null);
    const domain = await create.run(hostname, chosenId);
    if (!domain) return;
    setName('');
    onAdded(domain);
    push(`Domain added. ${domain.name} waits for the records of DNS.`);
    setCreated(domain);
  };

  const fieldError = create.fieldErrors.hostname ?? create.fieldErrors.name ?? create.fieldErrors.domain;

  return (
    <MailDialog
      open={open}
      title={created ? 'The domain was added' : 'Add an email domain'}
      description={
        created ? undefined : (
          <>
            Claim a hostname you own. We will tell you exactly which DNS records to publish, and mail is not
            delivered until they are in place.
          </>
        )
      }
      onClose={onClose}
      footer={
        created ? (
          <>
            <SoftButton onClick={onClose} className="w-full sm:w-auto">
              Done
            </SoftButton>
            <PrimaryButton
              onClick={() => navigate(mailDomainPath(created.id))}
              className="w-full sm:w-auto"
            >
              Open the domain
            </PrimaryButton>
          </>
        ) : (
          <>
            <SoftButton onClick={onClose} disabled={create.pending} className="w-full sm:w-auto">
              Cancel
            </SoftButton>
            <PrimaryButton onClick={() => void submit()} disabled={create.pending} className="w-full sm:w-auto">
              {create.pending ? 'Adding…' : 'Add domain'}
            </PrimaryButton>
          </>
        )
      }
    >
      {created ? (
        <ol className="mt-4 grid gap-3">
          <li className="rounded-2xl bg-s2 p-3.5">
            <p className="text-[14px] font-semibold text-ink">1. Publish the proof of ownership</p>
            {created.verificationHost ? (
              <p className="mt-1 break-all font-mono text-[12.5px] text-ink2">
                {created.verificationHost} — {created.verificationToken}
              </p>
            ) : (
              <p className="mt-1 text-[13px] leading-relaxed text-ink2">
                This domain was hosted without a plan of hosted mail, so it has no proof to publish.
              </p>
            )}
            <p className="mt-1 text-[13px] leading-relaxed text-ink2">
              The platform never writes your DNS. Add the record at your registrar, with the value written above.
            </p>
          </li>
          <li className="rounded-2xl bg-s2 p-3.5">
            <p className="text-[14px] font-semibold text-ink">2. Publish the records of mail</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink2">
              The page of the domain holds the MX and TXT records the mail needs, with the value of every one of them.
              Mail arrives only when they are all in place.
            </p>
          </li>
          <li className="rounded-2xl bg-s2 p-3.5">
            <p className="text-[14px] font-semibold text-ink">3. Let the server look at it</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink2">
              Open the domain and ask for a check. The page tells you which record is missing when one is.
            </p>
          </li>
        </ol>
      ) : (
        <div className="mt-4 grid gap-3">
          <TextInput
            label="Hostname"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            placeholder="acme.ro"
            error={error ?? fieldError}
            hint="The hostname without a protocol, like acme.ro."
            autoComplete="off"
            spellCheck={false}
          />
          {usable.length > 1 && (
            <Select
              label="The plan it belongs to"
              value={chosenId}
              onChange={(event) => setServiceId(event.target.value)}
              hint="A domain belongs to one plan. It is never added to two of them."
            >
              <option value="">Choose the plan</option>
              {usable.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.plan.name} · {entry.usage.domains} of {entry.limits.maxDomains} domains
                </option>
              ))}
            </Select>
          )}
          {service && (
            <p className="text-[13px] text-ink3">
              Your plan holds {service.limits.maxDomains} domain(s) and it holds {service.usage.domains}.
            </p>
          )}
          {create.error && (
            <p role="alert" className="text-[13.5px] font-medium text-bad">
              {create.error}
            </p>
          )}
        </div>
      )}
    </MailDialog>
  );
}
