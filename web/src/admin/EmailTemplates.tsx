import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { ErrorState, LoadingBlock, Panel } from '../ui-app';
import { can, denseGhost, useAdminSession } from './Overview';
import { EmailCoverage } from './EmailTools';

export interface Wording { subject: string; heading: string; preheader: string; note: string }
export interface Template {
  id: string;
  category: string;
  defaults: (Wording & { placeholders: string[] }) | null;
  override: Partial<Wording> | null;
}

export const FIELDS: { key: keyof Wording; label: string; hint: string }[] = [
  { key: 'subject', label: 'Subject', hint: 'What the inbox shows first.' },
  { key: 'heading', label: 'Heading', hint: 'The big line at the top of the message.' },
  { key: 'preheader', label: 'Preview line', hint: 'The grey line after the subject in the inbox.' },
  { key: 'note', label: 'Note at the end', hint: 'A short line under the facts, for example what to do if it was not you. Empty means none.' },
];

/** Change the wording of the emails without a deploy: the subject, the heading, the preview line and the note. The structure of a message stays in the code. */
export default function EmailTemplates() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'settings.write');
  const state = useAsync<{ templates: Template[] }>((signal) => get<{ templates: Template[] }>('/admin/email-templates', undefined, signal), []);
  const templates = state.data?.templates ?? [];

  if (state.loading && !state.data) return <LoadingBlock rows={3} label="Loading the templates" />;
  if (state.error) return <ErrorState title="The templates could not be loaded" message={state.error.message} onRetry={state.reload} />;
  return (
    <div className="grid gap-4">
      <Panel title="Email wording" description="Change what the emails say, without a deploy. A change reaches the next message sent.">
        <ul className="divide-y divide-line">
          {templates.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-[13.5px] font-medium text-ink">{entry.id}</p>
                <p className="text-[12.5px] text-ink3">{entry.category}{entry.override ? ' · changed' : ''}</p>
              </div>
              <Link to={`/admin/email-templates/${encodeURIComponent(entry.id)}/edit`} className={denseGhost}>{mayWrite ? 'Edit' : 'View'}</Link>
            </li>
          ))}
        </ul>
      </Panel>
      <EmailCoverage />
    </div>
  );
}
