import { useState } from 'react';
import { get, post } from '../../lib/api';
import { useAction } from '../../lib/useAsync';
import { Panel, PrimaryButton, SoftButton, useToast } from '../../ui-app';
import { useRouter } from '../../router';
import type { TabProps } from './common';

interface Finding { id: string; title: string; why: string; fix: string }

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
  const [findings, setFindings] = useState<{ list: Finding[]; looked: string[] } | null>(null);
  const check = useAction(async () => {
    const answer = await get<{ findings: Finding[]; looked: string[] }>(`/instances/${encodeURIComponent(instance.id)}/diagnose`);
    setFindings({ list: answer.findings, looked: answer.looked });
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
      {steps.length > 0 && (
        <Panel title="First steps" description="What most people do next with this product.">
          <ol className="grid gap-1.5 pl-5 text-[14px] text-ink2" style={{ listStyle: 'decimal' }}>
            {steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </Panel>
      )}
      <Panel
        title="Something not working?"
        description="We read the logs of this server for the usual causes, and we can open a ticket with the facts support asks for."
        action={<SoftButton onClick={() => void check.run()} disabled={check.pending}>{check.pending ? 'Reading…' : 'Check my logs'}</SoftButton>}
      >
        {check.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{check.error}</p>}
        {findings && (
          findings.list.length === 0 ? (
            <p className="text-[13.5px] text-ink2">No known cause in {findings.looked.length ? findings.looked.join(' and ') : 'the logs we can read'}. Open a ticket and we will look.</p>
          ) : (
            <ul className="grid gap-2">
              {findings.list.map((finding) => (
                <li key={finding.id} className="grid gap-1 rounded-2xl bg-s2 p-4">
                  <p className="text-[14px] font-semibold text-ink">{finding.title}</p>
                  <p className="text-[13px] text-ink2">{finding.why}</p>
                  <p className="text-[13px] text-ink"><strong>What to do:</strong> {finding.fix}</p>
                </li>
              ))}
            </ul>
          )
        )}
        <div className="mt-3">
          <PrimaryButton onClick={() => void ask.run()} disabled={ask.pending}>{ask.pending ? 'Opening…' : 'Ask support, with details'}</PrimaryButton>
          {ask.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{ask.error}</p>}
        </div>
      </Panel>
    </div>
  );
}
