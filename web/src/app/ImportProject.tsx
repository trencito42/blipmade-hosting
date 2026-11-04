import { useState, type ReactNode } from 'react';
import { post } from '../lib/api';
import { useAction } from '../lib/useAsync';
import { useRouter, Link } from '../router';
import { Panel, PrimaryButton, SoftButton, TextInput } from '../ui-app';

interface Proposal {
  productSlug: string | null;
  runtime: string | null;
  confidence: 'confirmed' | 'likely' | 'unknown';
  start: string | null;
  build?: string | null;
  files: string[];
  notes: string[];
  envNames?: string[];
  recommendedRam?: number | null;
  services?: { slug: string; reason: string; certainty?: string; linkable?: boolean; billable?: boolean }[];
}

function importServiceLabel(slug: string): string {
  if (slug === 'attached_mysql') return 'MySQL (attached to your app server)';
  if (slug === 'mariadb') return 'MariaDB server (standalone product)';
  if (slug === 'postgresql') return 'PostgreSQL';
  if (slug === 'redis') return 'Redis';
  return slug;
}

function defaultConfirmed(services: NonNullable<Proposal['services']>): string[] {
  return services.filter((service) => service.linkable && (service.slug === 'attached_mysql' || service.certainty === 'confirmed')).map((service) => service.slug);
}

function ReviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line/80 py-3 last:border-0 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-[12.5px] font-semibold uppercase tracking-wide text-ink3">{label}</dt>
      <dd className="min-w-0 text-[14px] text-ink2">{children}</dd>
    </div>
  );
}

/** Git or zip import: inspect manifests, confirm dependencies, then open the deploy wizard with a stored ImportSource. */
export function ImportProject({ compact = false }: { compact?: boolean }) {
  const [url, setUrl] = useState('');
  const { navigate } = useRouter();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [zipBase64, setZipBase64] = useState<string | null>(null);
  const [zipName, setZipName] = useState<string | null>(null);
  const inspect = useAction(async () => {
    const answer = await post<{ proposal: Proposal }>('/catalog/import/inspect', { url: url.trim() });
    setZipBase64(null);
    setZipName(null);
    setConfirmed([]);
    setProposal(answer.proposal);
    setConfirmed(defaultConfirmed(answer.proposal.services ?? []));
  });
  const plan = useAction(async () => {
    const answer = await post<{ plan: { continueTo: string; total: number; currency: string } }>('/catalog/import/plans', {
      ...(zipBase64 ? { zipBase64 } : { url: url.trim() }),
      confirmServices: confirmed,
    });
    navigate(answer.plan.continueTo);
  });
  const inspectZip = useAction(async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      setProposal({ productSlug: null, runtime: null, confidence: 'unknown', start: null, files: [], services: [], notes: ['The zip is larger than 8 MB.'] });
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const encoded = btoa(binary);
    setZipBase64(encoded);
    setZipName(file.name);
    setUrl('');
    const answer = await post<{ proposal: Proposal }>('/catalog/import/inspect', { zipBase64: encoded });
    setConfirmed([]);
    setProposal(answer.proposal);
    setConfirmed(defaultConfirmed(answer.proposal.services ?? []));
  });

  const requiredServices = (proposal?.services ?? []).filter((service) => service.certainty === 'confirmed' && service.linkable);
  const missingRequired = requiredServices.filter((service) => !confirmed.includes(service.slug));

  return (
    <div className="grid gap-4">
      {!compact && (
        <div className="grid gap-1">
          <h3 className="font-display text-[20px] font-semibold tracking-[-0.03em] text-ink">Import your repository or zip</h3>
          <p className="max-w-2xl text-[14px] leading-relaxed text-ink3">
            Blipmade reads public manifest files only. The same archive or repository is kept for the order — you do not paste the URL again at checkout.
          </p>
        </div>
      )}
      <Panel
        title={compact ? 'Source' : undefined}
        description={compact ? 'Public GitHub or GitLab URL, or a zip up to 8 MB.' : undefined}
        className={compact ? '' : 'border-line/80 bg-s1/40'}
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <TextInput
              label="Repository URL"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://github.com/owner/project"
              autoComplete="off"
              spellCheck={false}
              disabled={Boolean(zipBase64)}
            />
          </div>
          <SoftButton type="button" onClick={() => void inspect.run()} disabled={inspect.pending || !url.trim() || Boolean(zipBase64)}>
            {inspect.pending ? 'Inspecting…' : 'Inspect'}
          </SoftButton>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-4 text-[14px] font-semibold text-ink">
            Zip file
            <input type="file" accept=".zip,application/zip" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectZip.run(file); }} />
          </label>
        </div>
        {zipName && <p className="mt-2 text-[13px] text-ink3">Attached: {zipName}</p>}
        {inspect.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{inspect.error}</p>}
      </Panel>

      {proposal && (
        <Panel title="Review detected stack" description="Confirm what will be provisioned before you see the price.">
          {!proposal.productSlug ? (
            <p className="text-[14px] text-ink2">No supported runtime was found. Try another repository or choose a product from the catalog.</p>
          ) : (
            <dl className="divide-y divide-line/80">
              <ReviewRow label="Runtime">
                <span className="font-semibold text-ink">{proposal.runtime}</span>
                <span className="text-ink3"> · confidence {proposal.confidence}</span>
              </ReviewRow>
              <ReviewRow label="Source">
                {zipName ? <>Zip archive <span className="font-mono text-[13px]">{zipName}</span></> : <span className="break-all font-mono text-[13px]">{url.trim()}</span>}
              </ReviewRow>
              {proposal.build && (
                <ReviewRow label="Build">
                  <code className="block overflow-x-auto font-mono text-[13px]">{proposal.build}</code>
                </ReviewRow>
              )}
              {proposal.start && (
                <ReviewRow label="Start">
                  <code className="block overflow-x-auto font-mono text-[13px]">{proposal.start}</code>
                  <p className="mt-1 text-[12.5px] text-ink3">The allocation port replaces any port declared in the repository.</p>
                </ReviewRow>
              )}
              {proposal.recommendedRam ? (
                <ReviewRow label="Resources">
                  At least {proposal.recommendedRam} MB RAM for the production build. Adjust CPU and disk on the next step.
                </ReviewRow>
              ) : null}
              {proposal.files.length > 0 && (
                <ReviewRow label="Evidence">{proposal.files.join(', ')}</ReviewRow>
              )}
              {(proposal.envNames ?? []).length > 0 && (
                <ReviewRow label="Environment">
                  Names from examples: {(proposal.envNames ?? []).join(', ')}. Secret values are not read from the repository.
                </ReviewRow>
              )}
              {(proposal.services ?? []).length > 0 && (
                <ReviewRow label="Dependencies">
                  <ul className="grid gap-2">
                    {(proposal.services ?? []).map((service) => (
                      <li key={service.slug} className="flex items-start gap-2">
                        {service.linkable ? (
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={confirmed.includes(service.slug)}
                            onChange={(event) => setConfirmed((current) => event.target.checked ? [...current, service.slug] : current.filter((slug) => slug !== service.slug))}
                          />
                        ) : null}
                        <span>
                          <span className="font-medium text-ink">{importServiceLabel(service.slug)}</span> — {service.reason}
                          {service.linkable
                            ? service.billable
                              ? ' Add this product to your order.'
                              : service.slug === 'attached_mysql'
                                ? ' Included when your plan has a database slot.'
                                : ' Connected automatically when eligible.'
                            : ' Not provisioned automatically.'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </ReviewRow>
              )}
              {proposal.notes.map((note) => (
                <ReviewRow key={note} label="Note">{note}</ReviewRow>
              ))}
            </dl>
          )}
          {proposal.productSlug && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <PrimaryButton
                type="button"
                onClick={() => void plan.run()}
                disabled={plan.pending || missingRequired.length > 0}
              >
                {plan.pending ? 'Pricing…' : `Continue with ${proposal.productSlug}`}
              </PrimaryButton>
              {missingRequired.length > 0 && (
                <p className="text-[13px] text-bad">Select {missingRequired.map((service) => service.slug).join(', ')} to continue.</p>
              )}
              <Link to={`/app/deploy/${encodeURIComponent(proposal.productSlug)}`} className="text-[13.5px] font-semibold text-acc">
                Configure manually instead
              </Link>
            </div>
          )}
          {plan.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{plan.error}</p>}
        </Panel>
      )}
    </div>
  );
}
