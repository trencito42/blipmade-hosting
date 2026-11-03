import { useState } from 'react';
import { post } from '../lib/api';
import { useAction } from '../lib/useAsync';
import { Link, useRouter } from '../router';
import { Panel, PrimaryButton, TextInput } from '../ui-app';

interface Proposal {
  productSlug: string | null;
  runtime: string | null;
  confidence: 'confirmed' | 'likely' | 'unknown';
  start: string | null;
  build?: string | null;
  files: string[];
  notes: string[];
  services?: { slug: string; reason: string }[];
}

/** Looks at a public Git repository and points at a product. Nothing is installed. */
export function ImportProject() {
  const [url, setUrl] = useState('');
  const { navigate } = useRouter();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [zipBase64, setZipBase64] = useState<string | null>(null);
  const inspect = useAction(async () => {
    const answer = await post<{ proposal: Proposal }>('/catalog/import/inspect', { url: url.trim() });
    setZipBase64(null);
    setProposal(answer.proposal);
  });
  const plan = useAction(async () => {
    const answer = await post<{ plan: { continueTo: string; total: number; currency: string } }>('/catalog/import/plans', zipBase64 ? { zipBase64 } : { url: url.trim() });
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
    const answer = await post<{ proposal: Proposal }>('/catalog/import/inspect', { zipBase64: encoded });
    setProposal(answer.proposal);
  });

  return (
    <Panel title="Import a project" description="Paste a public GitHub or GitLab URL, or a zip of at most 8 MB. Blipmade reads the manifest files only and keeps that zip for the order. The build runs inside the new server. You do not upload the zip again.">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <TextInput label="Repository URL" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/owner/project" autoComplete="off" spellCheck={false} />
        </div>
        <PrimaryButton type="button" onClick={() => void inspect.run()} disabled={inspect.pending || !url.trim()}>Look</PrimaryButton>
        <label className="inline-flex h-11 cursor-pointer items-center rounded-xl border border-line px-4 text-[14px] font-semibold text-ink">
          Zip
          <input type="file" accept=".zip,application/zip" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectZip.run(file); }} />
        </label>
      </div>
      {inspect.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{inspect.error}</p>}
      {proposal && (
        <div className="mt-3 grid gap-1 text-[14px] text-ink2">
          <p>{proposal.productSlug ? <>This looks like <span className="font-semibold text-ink">{proposal.runtime}</span>. Confidence: {proposal.confidence}.</> : 'No supported runtime was found.'}</p>
          {proposal.build && <p>Build: <code className="font-mono text-[13px]">{proposal.build}</code></p>}
          {proposal.start && <p>Start: <code className="font-mono text-[13px]">{proposal.start}</code></p>}
          {proposal.files.length > 0 && <p>Read: {proposal.files.join(', ')}</p>}
          {proposal.notes.map((note) => <p key={note}>{note}</p>)}
          {(proposal.services ?? []).map((service) => <p key={service.slug}>{service.reason} <Link to={`/app/deploy/${encodeURIComponent(service.slug)}`} className="font-semibold text-acc">Order {service.slug}</Link></p>)}
          {proposal.productSlug && (
            <PrimaryButton type="button" onClick={() => void plan.run()} disabled={plan.pending}>Review the price and order {proposal.productSlug}</PrimaryButton>
          )}
          {plan.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{plan.error}</p>}
        </div>
      )}
    </Panel>
  );
}
