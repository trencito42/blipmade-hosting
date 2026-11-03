import { useEffect, useState } from 'react';
import { del, get, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, useAdminSession } from './Overview';
import { TemplateTools } from './EmailTools';
import { FIELDS, type Template, type Wording } from './EmailTemplates';

const BACK_TO = '/admin/email-templates';

/** The wording of one email on its own page. The structure of a message stays in the code. */
export default function EmailTemplateEdit() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'settings.write');
  const state = useAsync<{ templates: Template[] }>((signal) => get<{ templates: Template[] }>('/admin/email-templates', undefined, signal), []);
  const current = state.data?.templates.find((entry) => entry.id === id) ?? null;
  const [form, setForm] = useState<Wording>({ subject: '', heading: '', preheader: '', note: '' });
  const [base, setBase] = useState<Wording | null>(null);
  useEffect(() => {
    if (!current?.defaults) return;
    const next = {
      subject: current.override?.subject ?? current.defaults.subject,
      heading: current.override?.heading ?? current.defaults.heading,
      preheader: current.override?.preheader ?? current.defaults.preheader,
      note: current.override?.note ?? current.defaults.note,
    };
    setForm(next);
    setBase(next);
  }, [current?.id, current?.override, current?.defaults]);
  const dirty = base !== null && FIELDS.some((field) => form[field.key] !== base[field.key]);
  useUnsavedChangesGuard(dirty, 'Discard the changes to this wording?');
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
  const sample = (text: string) => text.replace(/\{\{\s*([^}]*?)\s*\}\}/g, (_all, path: string) => `[${path}]`);
  const discard = () => {
    if (!dirty || window.confirm('Discard the changes to this wording?')) navigate(BACK_TO);
  };
  return (
    <PageEditorShell
      eyebrow="Email wording"
      title={current ? current.id : 'Email template'}
      description="A change reaches the next message sent."
      backTo={BACK_TO}
      backLabel="Back to templates"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={save.pending}>Discard</SoftButton>
          {mayWrite && current?.override && <SoftButton type="button" onClick={() => void reset.run()} disabled={reset.pending}>Back to the original</SoftButton>}
          <PrimaryButton type="button" onClick={() => void save.run()} disabled={!mayWrite || save.pending || !dirty}>{save.pending ? 'Saving…' : 'Save the wording'}</PrimaryButton>
        </>
      }
    >
      {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the template" />
        : state.error ? <ErrorState title="The templates could not be loaded" message={state.error.message} onRetry={state.reload} />
        : !current?.defaults ? <ErrorState title="Template not found" message="It is not a template of the platform." />
        : (
          <div className="grid gap-4">
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
              <TemplateTools
                id={current.id}
                mayWrite={mayWrite}
                onRestored={state.reload}
                draft={Object.fromEntries(FIELDS.filter((field) => form[field.key].trim() !== current.defaults![field.key]).map((field) => [field.key, form[field.key]]))}
              />
          </div>
        )}
    </PageEditorShell>
  );
}
