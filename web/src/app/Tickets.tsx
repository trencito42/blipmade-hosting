import { useState } from 'react';
import { get, post, type Instance, type Ticket } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link } from '../router';
import {
  CardList,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Panel,
  PrimaryButton,
  Select,
  SoftButton,
  StatusPill,
  TextArea,
  TextInput,
  useToast,
} from '../ui-app';

interface TicketCategory {
  id: string;
  label: string;
}

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  awaiting_customer: 'Awaiting your reply',
  awaiting_staff: 'Awaiting support',
  on_hold: 'On hold',
  closed: 'Closed',
};

const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${DATE_FMT.format(date)}, ${TIME_FMT.format(date)}`;
}

function fmtRelative(value: string | null | undefined): string {
  if (!value) return 'No replies yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return DATE_FMT.format(date);
}

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}

export default function Tickets() {
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const tickets = useAsync((signal) => get<{ tickets: Ticket[] }>('/tickets', undefined, signal), []);
  const categories = useAsync((signal) => get<{ categories: TicketCategory[] }>('/tickets/categories', undefined, signal), []);

  const categoryLabel = (id: string) => categories.data?.categories.find((c) => c.id === id)?.label ?? id;
  const rows = tickets.data?.tickets ?? [];

  return (
    <div className="grid gap-4">
      {creating && (
        <NewTicketForm
          categories={categories.data?.categories ?? []}
          categoriesLoading={categories.loading}
          categoriesError={categories.error ? categories.error.message : null}
          reloadCategories={categories.reload}
          onClose={() => setCreating(false)}
          onCreated={(ticket) => {
            setCreating(false);
            tickets.reload();
            toast.push(`Ticket #${ticket.number} created`, 'ok');
          }}
        />
      )}

      <Panel
        title="Your tickets"
        description="Every conversation with Blipmade support, newest activity first."
        action={
          <PrimaryButton onClick={() => setCreating(true)} aria-expanded={creating}>
            New ticket
          </PrimaryButton>
        }
      >
        {tickets.loading ? (
          <LoadingBlock rows={4} label="Loading your tickets" />
        ) : tickets.error ? (
          <ErrorState
            title="Your tickets could not be loaded"
            message={tickets.error.message}
            onRetry={tickets.reload}
          />
        ) : !rows.length ? (
          <EmptyState
            title="No tickets yet."
            description="Open a ticket and we will answer in the same thread."
            action={<PrimaryButton onClick={() => setCreating(true)}>Create a ticket</PrimaryButton>}
          />
        ) : (
          <div className="grid gap-3">
            <DataTable<Ticket>
              rows={rows}
              rowKey={(t) => t.id}
              columns={[
                {
                  key: 'subject',
                  header: 'Subject',
                  render: (t) => (
                    <Link
                      to={`/app/tickets/${t.id}`}
                      title={t.subject}
                      className="block truncate font-bold tracking-[-0.02em] text-ink hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                    >
                      {t.subject}
                    </Link>
                  ),
                },
                { key: 'number', header: 'Number', render: (t) => <span className="font-mono tabular-nums text-ink2">#{t.number}</span> },
                { key: 'category', header: 'Category', render: (t) => <span className="text-ink2">{categoryLabel(t.category)}</span> },
                {
                  key: 'status',
                  header: 'Status',
                  render: (t) => <StatusPill status={t.status} label={statusLabel(t.status)} />,
                },
                {
                  key: 'last',
                  header: 'Last reply',
                  render: (t) => (
                    <span className="text-ink2" title={fmtDate(t.lastReplyAt)}>
                      {fmtRelative(t.lastReplyAt)}
                    </span>
                  ),
                },
                {
                  key: 'open',
                  header: 'Open',
                  render: (t) => (
                    <Link
                      to={`/app/tickets/${t.id}`}
                      aria-label={`Open ticket ${t.number}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink3 hover:bg-s3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                    >
                      <span aria-hidden="true">→</span>
                    </Link>
                  ),
                },
              ]}
            />

            <CardList<Ticket> rows={rows} rowKey={(t) => t.id}>
              {(t) => (
                <Link to={`/app/tickets/${t.id}`} className="flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15.5px] font-bold tracking-[-0.02em] text-ink" title={t.subject}>
                      {t.subject}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[13px] text-ink3"
                      title={`#${t.number} · ${categoryLabel(t.category)} · ${fmtRelative(t.lastReplyAt)}`}
                    >
                      #{t.number} · {categoryLabel(t.category)} · {fmtRelative(t.lastReplyAt)}
                    </p>
                  </div>
                  <StatusPill status={t.status} label={statusLabel(t.status)} />
                </Link>
              )}
            </CardList>
          </div>
        )}
      </Panel>
    </div>
  );
}

function NewTicketForm({
  categories,
  categoriesLoading,
  categoriesError,
  reloadCategories,
  onClose,
  onCreated,
}: {
  categories: TicketCategory[];
  categoriesLoading: boolean;
  categoriesError: string | null;
  reloadCategories: () => void;
  onClose: () => void;
  onCreated: (ticket: Ticket) => void;
}) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('normal');
  const [instanceId, setInstanceId] = useState('');
  const [body, setBody] = useState('');
  const [touched, setTouched] = useState(false);

  const instances = useAsync((signal) => get<{ instances: Instance[] }>('/instances', undefined, signal), []);

  const create = useAction(async () => {
    const payload: { subject: string; category: string; priority: string; body: string; instanceId?: string } = {
      subject: subject.trim(),
      category,
      priority,
      body: body.trim(),
    };
    if (instanceId) payload.instanceId = instanceId;
    const result = await post<{ ticket: Ticket }>('/tickets', payload);
    return result.ticket;
  });

  const subjectError = touched && !subject.trim() ? 'Give the ticket a subject.' : undefined;
  const categoryError = touched && !category ? 'Choose a category.' : undefined;
  const bodyError = touched && !body.trim() ? 'Describe what you need help with.' : undefined;
  const blocked = !subject.trim() || !category || !body.trim();

  const submit = async () => {
    setTouched(true);
    if (blocked) return;
    const ticket = await create.run();
    if (ticket) onCreated(ticket);
  };

  return (
    <>
      <div className="fixed inset-0 z-30 bg-bg/80 lg:hidden" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-0 z-40 max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-[26px] bg-s1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:static lg:z-auto lg:mt-0 lg:max-h-none lg:rounded-[22px] lg:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-extrabold tracking-[-0.03em] text-ink">New ticket</h2>
            <p className="mt-1 text-[13.5px] text-ink2">Tell us what happened and we will reply in this thread.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the new ticket form"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-s3 text-ink2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="grid gap-3">
          <TextInput
            label="Subject"
            placeholder="Short summary of the problem"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            error={subjectError}
            autoComplete="off"
            className="scroll-mt-16"
          />

          {categoriesLoading ? (
            <p className="px-1 text-[12.5px] text-ink3" role="status">
              Loading categories…
            </p>
          ) : categoriesError ? (
            <div className="rounded-2xl bg-s2 px-4 py-3 text-[13px] text-ink2" role="alert">
              <p className="font-bold text-bad">Categories could not be loaded.</p>
              <p className="mt-1">{categoriesError}</p>
              <SoftButton className="mt-3" onClick={reloadCategories}>
                Retry
              </SoftButton>
            </div>
          ) : (
            <Select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              error={categoryError}
              className="scroll-mt-16"
            >
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}

          <Select
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="scroll-mt-16"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>

          <Select
            label="Related instance"
            hint="Optional. Links the ticket to one of your apps or databases."
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
            className="scroll-mt-16"
          >
            <option value="">No related instance</option>
            {instances.data?.instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>

          <TextArea
            label="Message"
            placeholder="What did you expect, and what happened instead?"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            error={bodyError}
            className="scroll-mt-16"
          />

          {create.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
              {create.error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <SoftButton onClick={onClose} disabled={create.pending} className="w-full sm:w-auto">
              Cancel
            </SoftButton>
            <PrimaryButton onClick={submit} disabled={create.pending} className="w-full sm:w-auto">
              {create.pending ? 'Sending…' : 'Create ticket'}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </>
  );
}
