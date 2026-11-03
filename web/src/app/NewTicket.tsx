import { useCallback, useMemo, useState } from 'react';
import { ArticleSuggestions } from './ArticleSuggestions';
import { get, post, uploadTicketAttachment, type Instance, type MailServiceView, type Ticket } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useRouter } from '../router';
import {
  ErrorState,
  LoadingBlock,
  PrimaryButton,
  Segmented,
  Select,
  SoftButton,
  TextArea,
  TextInput,
  useToast,
} from '../ui-app';
import { AsyncCombobox, FileDropzone, PageEditorShell, useUnsavedChangesGuard, type ComboboxOption } from './components/premium';

interface TicketCategory {
  id: string;
  label: string;
}

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

const TICKET_ATTACHMENT_TYPES = [
  'text/plain',
  'text/csv',
  'application/json',
  'application/pdf',
  'application/zip',
  'application/gzip',
  'application/x-tar',
  'application/octet-stream',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export default function NewTicket() {
  const { navigate } = useRouter();
  const toast = useToast();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('normal');
  const [service, setService] = useState('');
  const [serviceLabel, setServiceLabel] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [created, setCreated] = useState<{ ticket: Ticket; initialMessageId: string } | null>(null);
  const [uploadedKeys, setUploadedKeys] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  const categories = useAsync((signal) => get<{ categories: TicketCategory[] }>('/tickets/categories', undefined, signal), []);

  const loadServices = useCallback(async (query: string, signal: AbortSignal): Promise<ComboboxOption[]> => {
    const [instanceResult, mailResult] = await Promise.all([
      get<{ instances: Instance[] }>('/instances', undefined, signal),
      get<{ services: MailServiceView[] }>('/mail/services', undefined, signal),
    ]);
    const normalized = query.toLocaleLowerCase();
    const options: ComboboxOption[] = [
      ...instanceResult.instances.map((item) => ({ value: `instance:${item.id}`, label: item.name, group: 'Apps and databases', description: item.product?.name })),
      ...mailResult.services.map((item) => ({ value: `mail:${item.id}`, label: item.plan.name, group: 'Email hosting' })),
    ];
    return options.filter((item) => !normalized || `${item.label} ${item.group} ${item.description ?? ''}`.toLocaleLowerCase().includes(normalized));
  }, []);

  const dirty = Boolean(subject || category || service || body || files.length || priority !== 'normal');
  useUnsavedChangesGuard(dirty, created ? 'The ticket exists, but some selected files are not uploaded yet. Leave this page?' : 'Discard this ticket draft?');

  const create = useAction(async () => {
    const payload: {
      subject: string;
      category: string;
      priority: string;
      body: string;
      instanceId?: string;
      mailServiceId?: string;
    } = {
      subject: subject.trim(),
      category,
      priority,
      body: body.trim(),
    };
    if (service.startsWith('instance:')) payload.instanceId = service.slice('instance:'.length);
    if (service.startsWith('mail:')) payload.mailServiceId = service.slice('mail:'.length);
    let result = created;
    if (!result) {
      result = await post<{ ticket: Ticket; initialMessageId: string }>('/tickets', payload);
      setCreated(result);
    }
    const completed = new Set(uploadedKeys);
    for (const file of files) {
      const key = fileKey(file);
      if (completed.has(key)) continue;
      await uploadTicketAttachment(result.ticket.id, result.initialMessageId, file);
      completed.add(key);
      setUploadedKeys([...completed]);
    }
    return result.ticket;
  });

  const subjectError = touched && !subject.trim() ? 'Give the ticket a subject.' : undefined;
  const categoryError = touched && !category ? 'Choose a category.' : undefined;
  const bodyError = touched && !body.trim() ? 'Describe what you need help with.' : undefined;
  const blocked = !subject.trim() || !category || !body.trim() || categories.loading || Boolean(categories.error);

  const submit = async () => {
    setTouched(true);
    if (blocked) {
      const first = !subject.trim() ? 'ticket-subject' : !category ? 'ticket-category' : 'ticket-message';
      document.getElementById(first)?.focus();
      return;
    }
    const ticket = await create.run();
    if (!ticket) return;
    toast.push(`Ticket #${ticket.number} created`, 'ok');
    navigate(`/app/tickets/${ticket.id}`, { replace: true });
  };

  const discard = () => {
    if (!dirty || window.confirm(created ? 'Leave this page? The ticket has already been created.' : 'Discard this ticket draft?')) navigate('/app/tickets');
  };

  const help = useMemo(() => {
    if (!service) return 'Choose a related service when the question is about a specific deployment. It helps support find the right context without asking you for internal IDs.';
    return 'The ticket will link to this service. Support still receives only the customer-safe ticket context allowed by the API.';
  }, [service]);

  return (
    <PageEditorShell stickyActions
      eyebrow="Support"
      title="Open a new ticket"
      description="Describe the issue in one focused conversation. After creation, attachments and replies continue in the ticket workspace."
      backTo="/app/tickets"
      backLabel="Back to support"
      dirty={dirty}
      aside={
        <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
          <h2 className="text-[16px] font-semibold text-ink">Before you send</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink2">{help}</p>
          <ul className="mt-4 grid gap-2 text-[12.5px] leading-relaxed text-ink3">
            <li>Never include passwords, API keys or private SSH keys.</li>
            <li>Add exact error wording and the time it happened.</li>
            <li>Use High only when a running service is unavailable or data is at risk.</li>
          </ul>
        </aside>
      }
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={create.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={create.pending || categories.loading}>
            {create.pending ? (created ? 'Uploading…' : 'Sending…') : created ? 'Retry remaining uploads' : 'Create ticket'}
          </PrimaryButton>
        </>
      }
    >
      <div className="grid gap-5">
        <ArticleSuggestions text={subject} />
        <TextInput
          id="ticket-subject"
          label="Subject"
          placeholder="Short summary of the problem"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          error={subjectError ?? create.fieldErrors.subject}
          autoComplete="off"
          maxLength={160}
          className="scroll-mt-24"
        />

        {categories.loading ? (
          <LoadingBlock rows={1} label="Loading ticket categories" />
        ) : categories.error ? (
          <ErrorState title="Categories could not be loaded" message={categories.error.message} onRetry={categories.reload} />
        ) : (
          <Select
            id="ticket-category"
            label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            error={categoryError ?? create.fieldErrors.category}
            className="scroll-mt-24"
          >
            <option value="">Choose a category</option>
            {categories.data?.categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </Select>
        )}

        <div className="grid gap-2">
          <p className="px-1 text-[13.5px] font-medium text-ink">Priority</p>
          <Segmented role="group" ariaLabel="Ticket priority" options={PRIORITIES} value={priority} onChange={setPriority} />
        </div>

        <AsyncCombobox
          label="Related service"
          hint="Optional. Search your apps, databases and email services; the API still verifies ownership when the ticket is created."
          value={service}
          selectedLabel={serviceLabel}
          placeholder="Search your services…"
          loadOptions={loadServices}
          onChange={(next, option) => {
            setService(next);
            setServiceLabel(option?.label ?? '');
          }}
        />

        <TextArea
          id="ticket-message"
          label="Message"
          hint="Include the expected result, what happened instead and any safe steps needed to reproduce it."
          placeholder="What did you expect, and what happened instead?"
          rows={9}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          error={bodyError ?? create.fieldErrors.body}
          maxLength={20_000}
          className="scroll-mt-24"
        />

        <FileDropzone
          files={files}
          onFilesChange={setFiles}
          accept={TICKET_ATTACHMENT_TYPES}
          maxFiles={5}
          maxBytes={5 * 1024 * 1024}
          disabled={create.pending || Boolean(created)}
          label="Attachments"
        />
        {created && uploadedKeys.length < files.length && (
          <p role="status" className="rounded-2xl bg-warn/10 px-4 py-3 text-[13px] text-warn">
            Ticket #{created.ticket.number} was created. {uploadedKeys.length} of {files.length} attachments uploaded; retry to finish the remaining files.
          </p>
        )}

        {create.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{create.error}</p>}
      </div>
    </PageEditorShell>
  );
}
