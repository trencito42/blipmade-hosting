import { useCallback, useMemo, useState } from 'react';
import { get, post, type Domain, type Instance } from '../lib/api';
import { useAction } from '../lib/useAsync';
import { useRouter } from '../router';
import { PrimaryButton, SoftButton, useToast } from '../ui-app';
import {
  AsyncCombobox,
  DomainInput,
  PageEditorShell,
  useUnsavedChangesGuard,
  type ComboboxOption,
} from './components/premium';

export function normalizeHostname(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw || raw.includes('://') || /[/?#:@]/.test(raw)) return raw;
  try {
    return new URL(`https://${raw}`).hostname.toLowerCase();
  } catch {
    return raw;
  }
}

export function validateHostname(value: string): string | undefined {
  const raw = value.trim().toLowerCase();
  if (!raw) return 'Enter the hostname you want to use.';
  if (raw.includes('*')) return 'A wildcard cannot be claimed. Enter one exact hostname.';
  if (raw.includes('://') || /[/?#:@]/.test(raw)) return 'Enter only a hostname, without a protocol, path, port or credentials.';
  const hostname = normalizeHostname(raw);
  if (hostname.length > 253) return 'That hostname is too long.';
  if (!hostname.includes('.')) return 'Enter a full hostname, such as app.example.com.';
  const labels = hostname.split('.');
  if (labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    return 'Enter a valid hostname. Labels cannot start or end with a dash.';
  }
  return undefined;
}

export default function NewDomain() {
  const { navigate } = useRouter();
  const toast = useToast();
  const [instanceId, setInstanceId] = useState('');
  const [instanceLabel, setInstanceLabel] = useState('');
  const [hostname, setHostname] = useState('');
  const [touched, setTouched] = useState(false);
  const dirty = Boolean(instanceId || hostname);
  useUnsavedChangesGuard(dirty, 'Discard this domain claim?');

  const loadInstances = useCallback(async (query: string, signal: AbortSignal): Promise<ComboboxOption[]> => {
    const result = await get<{ instances: Instance[] }>('/instances', undefined, signal);
    const normalized = query.toLocaleLowerCase();
    return result.instances
      .filter((instance) => !normalized || `${instance.name} ${instance.product.name}`.toLocaleLowerCase().includes(normalized))
      .map((instance) => ({
        value: instance.id,
        label: instance.name,
        group: 'Apps and databases',
        description: `${instance.product.name} · ${instance.status.toLowerCase().replace(/_/g, ' ')}`,
        disabled: instance.access === 'viewer',
        disabledReason: instance.access === 'viewer' ? 'Viewer access cannot attach domains.' : undefined,
      }));
  }, []);

  const create = useAction(async () => {
    const result = await post<{ domain: Domain }>(`/instances/${instanceId}/domains`, { hostname: normalizeHostname(hostname) });
    return result.domain;
  });

  const hostnameError = touched ? validateHostname(hostname) : undefined;
  const instanceError = touched && !instanceId ? 'Choose the instance this hostname should route to.' : undefined;
  const blocked = Boolean(validateHostname(hostname)) || !instanceId;

  const submit = async () => {
    setTouched(true);
    if (blocked) return;
    const domain = await create.run();
    if (!domain) return;
    toast.push(`${domain.hostname} claimed. Publish its TXT record, then verify it.`);
    navigate(`/app/domains?created=${encodeURIComponent(domain.id)}`, { replace: true });
  };

  const discard = () => {
    if (!dirty || window.confirm('Discard this domain claim?')) navigate('/app/domains');
  };

  const normalizedHostname = useMemo(() => normalizeHostname(hostname), [hostname]);

  return (
    <PageEditorShell
      eyebrow="Website domains"
      title="Add a domain"
      description="Claim one exact hostname, link it to an instance and prove ownership before Blipmade routes traffic or requests TLS."
      backTo="/app/domains"
      backLabel="Back to domains"
      dirty={dirty}
      aside={
        <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
          <h2 className="text-[16px] font-semibold text-ink">What happens next</h2>
          <ol className="mt-3 grid list-decimal gap-2 pl-5 text-[13px] leading-relaxed text-ink2">
            <li>Blipmade creates a time-limited ownership claim.</li>
            <li>You publish the exact TXT proof returned by the API.</li>
            <li>After verification, the gateway configures routing and TLS.</li>
          </ol>
          <div className="mt-4 rounded-xl bg-s2 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink3">Claim preview</p>
            <p className="mt-1 break-all font-mono text-[13px] text-ink">{normalizedHostname || 'app.example.com'}</p>
            <p className="mt-1 text-[12px] text-ink3">Routes to {instanceLabel || 'the instance you choose'} only after ownership is verified.</p>
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed text-ink3">Email domains are separate. Configure MX, DKIM and mailboxes from the Email section.</p>
        </aside>
      }
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={create.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={create.pending}>
            {create.pending ? 'Creating claim…' : 'Create domain claim'}
          </PrimaryButton>
        </>
      }
    >
      <div className="grid gap-5">
        <AsyncCombobox
          label="Instance"
          value={instanceId}
          selectedLabel={instanceLabel}
          onChange={(value, option) => {
            setInstanceId(value);
            setInstanceLabel(option?.label ?? '');
          }}
          loadOptions={loadInstances}
          placeholder="Search your apps and databases…"
          hint="The hostname will route to this instance. Viewer-only shared instances cannot be changed."
          error={instanceError ?? create.fieldErrors.instanceId}
        />
        <DomainInput
          value={hostname}
          onChange={setHostname}
          error={hostnameError ?? create.fieldErrors.hostname}
          hint="Use the full hostname without https://, a port or a path. Wildcards are not accepted."
        />
        {create.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{create.error}</p>}
      </div>
    </PageEditorShell>
  );
}
