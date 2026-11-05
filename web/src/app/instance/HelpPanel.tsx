import { useState } from 'react';
import { get, post } from '../../lib/api';
import { useAction } from '../../lib/useAsync';
import { Panel, PrimaryButton, SoftButton, useToast } from '../../ui-app';
import { useRouter } from '../../router';
import type { TabProps } from './common';

interface Finding { id: string; title: string; why: string; fix: string; confidence: 'high' | 'medium'; tab?: string }
interface Source { id: string; label: string; state: 'available' | 'missing' | 'inaccessible' | 'unsupported' | 'failed'; note: string }
interface Diagnosis { verdict: 'clear' | 'insufficient' | 'issue' | 'unreachable'; summary: string; findings: Finding[]; sources: Source[] }

const STATE_LABEL: Record<Source['state'], string> = {
  available: 'Read',
  missing: 'Not there',
  inaccessible: 'Not allowed',
  unsupported: 'Not stored',
  failed: 'Could not be read',
};

const TAB_LABEL: Record<string, string> = {
  console: 'Console',
  files: 'Files',
  startup: 'Startup',
  git: 'Deploy',
  databases: 'Databases',
  resources: 'Resources',
  activity: 'Activity',
};

/** What to do next for a product that was just deployed, in the words of that product. */
const NEXT_STEPS: Record<string, string[]> = {
  nodejs: ['Upload your app in the Files tab, or connect a repository in the Deploy tab.', 'Make the app listen on the port in the SERVER_PORT variable.', 'Set your secrets as environment variables in the Deploy tab.'],
  'discord-bot': ['Put your bot token in an environment variable in the Deploy tab, never in the code.', 'Upload the bot or connect its repository in the Deploy tab.', 'Watch the Console tab to see it log in.'],
  'minecraft-paper': ['Open the Minecraft tab: copy the join address and add yourself to the whitelist.', 'Accept the EULA in the Startup tab if the server asks for it.', 'Turn on automatic backups in the Backups tab.'],
  'minecraft-folia': ['Open the Minecraft tab: copy the join address and add yourself to the whitelist.', 'Turn on automatic backups in the Backups tab.'],
  'minecraft-forge': ['Open the Minecraft tab: copy the join address.', 'Upload your mods in the Files tab, in the mods folder.', 'Turn on automatic backups in the Backups tab.'],
  wordpress: ['Create a database in the Databases tab and copy its credentials.', 'Open your site address and finish the setup with those values (host as shown, not localhost).', 'Turn on automatic backups in the Backups tab.'],
};

/**
 * Help at the top of a server's overview: what its logs say in plain words, a ticket with the facts support asks for
 * (secrets removed), and the first steps for the product.
 */
export default function HelpPanel({ instance, productSlug }: TabProps & { productSlug: string }) {
  const { push } = useToast();
  const { navigate } = useRouter();
  const [report, setReport] = useState<Diagnosis | null>(null);
  const check = useAction(async () => {
    setReport(await get<Diagnosis>(`/instances/${encodeURIComponent(instance.id)}/diagnose`));
  });
  const ask = useAction(async () => {
    const bundle = await get<{ subject: string; body: string; instanceId: string }>(`/instances/${encodeURIComponent(instance.id)}/support-bundle`);
    const made = await post<{ ticket: { id: string } }>('/tickets', { subject: bundle.subject, body: bundle.body, instanceId: bundle.instanceId, category: 'TECHNICAL' });
    push('A ticket was opened with the details of this server. Secrets were removed.', 'ok');
    navigate(`/app/tickets/${made.ticket.id}`);
  });
  const steps = NEXT_STEPS[productSlug] ?? [];

  return (
    <div className="grid gap-4">
      <details className="rounded-2xl border border-line bg-card p-4 text-[14px] text-ink2">
        <summary className="cursor-pointer text-[14.5px] font-semibold text-ink">Moving an existing server here</summary>
        <ol className="mt-3 grid gap-1.5 pl-5" style={{ listStyle: 'decimal' }}>
          <li>Stop the old server and make a full copy of its files (a .zip or .tar.gz). Stopping it first keeps the copy consistent.</li>
          <li>Upload the copy in the Files tab, or use SFTP (Settings tab) for large files, and unpack it in the server folder.</li>
          <li>For a database, export it as a .sql file where it is now and import it into a database made in the Databases tab. Update the host and the password in your app.</li>
          <li>For Minecraft, upload the world folder and the plugins folder; keep the version of the server the same as the old one at first.</li>
          <li>Start the server, read the Console tab, and check it works before you point your domain at it.</li>
        </ol>
        <p className="mt-3 text-[13px] text-ink3">What does not move by itself: your domain and its DNS, secrets in environment variables, scheduled jobs of the old host, and anything that was outside the server folder.</p>
      </details>
      {steps.length > 0 && (
        <Panel title="First steps" description="What most people do next with this product.">
          <ol className="grid gap-1.5 pl-5 text-[14px] text-ink2" style={{ listStyle: 'decimal' }}>
            {steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </Panel>
      )}
      <Panel
        title="Something not working?"
        description="We read the logs this server actually keeps, say which ones we could open, and we can attach that to a ticket. The live console is not a saved log."
        action={<SoftButton onClick={() => void check.run()} disabled={check.pending}>{check.pending ? 'Reading…' : 'Check my logs'}</SoftButton>}
        actionBelow
      >
        {check.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{check.error}</p>}
        {report && (
          <div className="grid gap-3" data-testid="diagnosis">
            <p className="text-[13.5px] text-ink2" data-testid="diagnosis-summary">{report.summary}</p>
            <ul className="grid gap-1">
              {report.sources.map((source) => (
                <li key={source.id} className="text-[13px] text-ink2" data-testid={`source-${source.id}`}>
                  <span className="font-semibold text-ink">{source.label}:</span> {STATE_LABEL[source.state]}. {source.note}
                </li>
              ))}
            </ul>
            {report.findings.length > 0 && (
              <ul className="grid gap-2">
                {report.findings.map((finding) => (
                  <li key={finding.id} className="grid gap-1 rounded-2xl bg-s2 p-4">
                    <p className="text-[14px] font-semibold text-ink">{finding.title}</p>
                    <p className="text-[13px] text-ink2">{finding.why} {finding.confidence === 'medium' ? 'This is a clue, not a confirmed cause.' : ''}</p>
                    <p className="text-[13px] text-ink"><strong>What to do:</strong> {finding.fix}</p>
                    {finding.tab && TAB_LABEL[finding.tab] && (
                      <button type="button" className="w-fit text-[13px] font-semibold text-accent" onClick={() => navigate(`/app/instances/${instance.id}/${finding.tab}`)}>
                        Open {TAB_LABEL[finding.tab]}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="mt-3">
          <PrimaryButton onClick={() => void ask.run()} disabled={ask.pending}>{ask.pending ? 'Opening…' : 'Ask support, with details'}</PrimaryButton>
          {ask.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{ask.error}</p>}
        </div>
      </Panel>
    </div>
  );
}
