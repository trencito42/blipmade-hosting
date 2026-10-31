import { useEffect, useState } from 'react';
import { del, get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { ErrorState, LoadingBlock, Panel, PrimaryButton, Select, SoftButton, TextInput, useToast } from '../ui-app';
import { can, useAdminSession } from './Overview';

interface Wording { subject: string; heading: string; preheader: string; note: string }
interface Template {
  id: string;
  category: string;
  defaults: (Wording & { placeholders: string[] }) | null;
  override: Partial<Wording> | null;
}

const FIELDS: { key: keyof Wording; label: string; hint: string }[] = [
  { key: 'subject', label: 'Subject', hint: 'What the inbox shows first.' },
  { key: 'heading', label: 'Heading', hint: 'The big line at the top of the message.' },
  { key: 'preheader', label: 'Preview line', hint: 'The grey line after the subject in the inbox.' },
  { key: 'note', label: 'Note at the end', hint: 'A short line under the facts, for example what to do if it was not you. Empty means none.' },
];

/** Change the wording of the emails without a deploy: the subject, the heading, the preview line and the note. The structure of a message stays in the code. */
export default function EmailTemplates() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'settings.write');
  const toast = useToast();
  const state = useAsync<{ templates: Template[] }>((signal) => get<{ templates: Template[] }>('/admin/email-templates', undefined, signal), []);
  const [id, setId] = useState('');
  const [form, setForm] = useState<Wording>({ subject: '', heading: '', preheader: '', note: '' });
  const templates = state.data?.templates ?? [];
  const current = templates.find((entry) => entry.id === id) ?? null;

  useEffect(() => {
    if (!id && templates[0]) setId(templates[0].id);
  }, [templates, id]);
  useEffect(() => {
    if (!current?.defaults) return;
    setForm({
      subject: current.override?.subject ?? current.defaults.subject,
      heading: current.override?.heading ?? current.defaults.heading,
      preheader: current.override?.preheader ?? current.defaults.preheader,
      note: current.override?.note ?? current.defaults.note,
    });
  }, [current?.id, current?.override, current?.defaults]);

  const save = useAction(async () => {
    if (!current?.defaults) return;
    // Only what differs from the code is stored, so a later change of the code still reaches an unchanged part.
    const body: Partial<Wording> = {};
    for (const field of FIELDS) if (form[field.key].trim() !== current.defaults[field.key]) body[field.key] = form[field.key];
    await put(`/admin/email-templates/${encodeURIComponent(current.id)}`, body);
    toast.push('The wording was saved. It reaches the next message.', 'ok');
    state.reload();
  });
  const reset = useAction(async () => {
    if (!current) return;
    await del(`/admin/email-templates/${encodeURIComponent(current.id)}`);
    toast.push('The template is back to its original wording.', 'ok');
    state.reload();
  });

  if (state.loading && !state.data) return <LoadingBlock rows={3} label="Loading the templates" />;
  if (state.error) return <ErrorState title="The templates could not be loaded" message={state.error.message} onRetry={state.reload} />;
  const sample = (text: string) => text.replace(/\{\{\s*([^}]*?)\s*\}\}/g, (_all, path: string) => `[${path}]`);

  return (
    <div className="grid gap-4">
      <Panel title="Email wording" description="Change what the emails say, without a deploy. A change reaches the next message sent.">
        <div className="grid gap-4">
          <Select label="Template" value={id} onChange={(event) => setId(event.target.value)}>
            {templates.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.id}{entry.override ? ' (changed)' : ''}</option>
            ))}
          </Select>
          {current?.defaults && (
            <>
              <p className="text-[13px] text-ink2">
                Placeholders you can use: {current.defaults.placeholders.length ? current.defaults.placeholders.map((name) => <code key={name} className="mx-0.5 rounded bg-s3 px-1.5 py-0.5 font-mono text-[12px] text-ink">{`{{${name}}}`}</code>) : 'none'}
              </p>
              {FIELDS.map((field) => (
                <TextInput
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  value={form[field.key]}
                  onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                  disabled={!mayWrite}
                  error={save.fieldErrors[field.key]}
                />
              ))}
              <div className="rounded-2xl bg-s2 p-4">
                <p className="text-[12px] uppercase tracking-[0.08em] text-ink3">Subject as it reads</p>
                <p className="mt-1 text-[15px] font-semibold text-ink">{sample(form.subject)}</p>
                <p className="mt-0.5 text-[13px] text-ink3">{sample(form.preheader)}</p>
              </div>
              {save.error && !Object.keys(save.fieldErrors).length && <p role="alert" className="text-[13.5px] font-medium text-bad">{save.error}</p>}
              {mayWrite && (
                <div className="flex flex-wrap gap-2">
                  <PrimaryButton onClick={() => void save.run()} disabled={save.pending}>{save.pending ? 'Saving…' : 'Save the wording'}</PrimaryButton>
                  {current.override && <SoftButton onClick={() => void reset.run()} disabled={reset.pending}>Back to the original</SoftButton>}
                </div>
              )}
              <p className="text-[12.5px] text-ink3">To see a message as a customer gets it, use the preview in Email and notifications.</p>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
