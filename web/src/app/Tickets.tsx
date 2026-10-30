import { useCallback, useEffect, useRef, useState } from 'react';
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
  Segmented,
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
  // The API answers with the upper case of the enumeration. The label is
  // found either way, so the page keeps working with both.
  return STATUS_LABEL[status.toLowerCase()] ?? status.replace(/_/g, ' ');
}

export default function Tickets() {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const newTicketButton = useRef<HTMLButtonElement>(null);

  const tickets = useAsync((signal) => get<{ tickets: Ticket[] }>('/tickets', undefined, signal), []);
  const categories = useAsync((signal) => get<{ categories: TicketCategory[] }>('/tickets/categories', undefined, signal), []);

  const categoryLabel = (id: string) => categories.data?.categories.find((c) => c.id === id)?.label ?? id;
  const rows = tickets.data?.tickets ?? [];

  // Closing the form gives the focus back to the button that opened it. The
  // function keeps its identity, so the form is not focused again on every
  // render of the page.
  const closeForm = useCallback(() => {
    setCreating(false);
    newTicketButton.current?.focus();
  }, []);

  return (
    <div className="grid gap-4">
      {creating && (
        <NewTicketForm
          categories={categories.data?.categories ?? []}
          categoriesLoading={categories.loading}
          categoriesError={categories.error ? categories.error.message : null}
          reloadCategories={categories.reload}
          onClose={closeForm}
          onCreated={(ticket) => {
            setCreating(false);
            tickets.reload();
            toast.push(`Ticket #${ticket.number} created`, 'ok');
            newTicketButton.current?.focus();
          }}
        />
      )}

      <Panel
        title="Your tickets"
        description="Every conversation with Blipmade support, newest activity first."
        actionBelow
        action={
          // With no tickets the empty state carries the one action, so the
          // page never offers two buttons for the same thing.
          rows.length ? (
            <PrimaryButton
              ref={newTicketButton}
              onClick={() => setCreating(true)}
              aria-expanded={creating}
              aria-controls="new-ticket-form"
            >
              New ticket
            </PrimaryButton>
          ) : undefined
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
            action={
              <PrimaryButton
                ref={newTicketButton}
                onClick={() => setCreating(true)}
                aria-expanded={creating}
                aria-controls="new-ticket-form"
              >
                Create a ticket
              </PrimaryButton>
            }
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
                  truncate: true,
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
                { key: 'number', header: 'Number', nowrap: true, render: (t) => <span className="font-mono tabular-nums text-ink2">#{t.number}</span> },
                { key: 'category', header: 'Category', nowrap: true, render: (t) => <span className="text-ink2">{categoryLabel(t.category)}</span> },
                {
                  key: 'status',
                  header: 'Status',
                  nowrap: true,
                  render: (t) => <StatusPill status={t.status} label={statusLabel(t.status)} />,
                },
                {
                  key: 'last',
                  header: 'Last reply',
                  nowrap: true,
                  render: (t) => (
                    <span className="text-ink2" title={fmtDate(t.lastReplyAt)}>
                      {fmtRelative(t.lastReplyAt)}
                    </span>
                  ),
                },
                {
                  key: 'open',
                  header: 'Open',
                  align: 'center',
                  nowrap: true,
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
                <Link
                  to={`/app/tickets/${t.id}`}
                  className="flex min-w-0 flex-wrap items-start justify-between gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                >
                  <div className="w-0 min-w-0 flex-1">
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
                  {/* The status gets a line of its own on a phone, so a long
                      subject is not cut to make room for the pill. */}
                  <div className="w-full sm:w-auto">
                    <StatusPill status={t.status} label={statusLabel(t.status)} />
                  </div>
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
  const formRef = useRef<HTMLDivElement>(null);

  const instances = useAsync((signal) => get<{ instances: Instance[] }>('/instances', undefined, signal), []);

  // The form is a region of the page: the focus goes into it when it opens
  // and it closes with Escape.
  useEffect(() => {
    formRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      // Escape inside a dropdown belongs to the dropdown, not to the form.
      if (event.key !== 'Escape') return;
      if (event.target instanceof HTMLSelectElement) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    if (blocked) {
      // The first field that is missing takes the focus, so the user is taken
      // to the problem instead of hunting for it.
      const first = !subject.trim() ? 'ticket-subject' : !category ? 'ticket-category' : 'ticket-message';
      document.getElementById(first)?.focus();
      return;
    }
    const ticket = await create.run();
    if (ticket) onCreated(ticket);
  };

  return (
    // The form is part of the page and not a sheet pinned to the bottom of the
    // screen: a pinned sheet is covered by the software keyboard and the
    // field that is being typed into cannot be reached.
    <div
      id="new-ticket-form"
      ref={formRef}
      tabIndex={-1}
      className="scroll-mt-24 rounded-2xl bg-s1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] focus:outline-none sm:p-5"
    >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-ink">New ticket</h2>
            <p className="mt-1 text-[13.5px] text-ink2">Tell us what happened and we will reply in this thread.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the new ticket form"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-ink2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="grid gap-3">
          <TextInput
            id="ticket-subject"
            label="Subject"
            placeholder="Short summary of the problem"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            error={subjectError}
            autoComplete="off"
            className="scroll-mt-24"
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
              id="ticket-category"
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              error={categoryError}
              className="scroll-mt-24"
            >
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}

          {/* The priority is three choices: a strip of buttons is easier to
              hit than a dropdown on a phone. */}
          <div className="grid gap-2">
            <p className="px-1 text-[13.5px] font-medium text-ink">Priority</p>
            <Segmented
              role="group"
              ariaLabel="Priority"
              options={PRIORITIES}
              value={priority}
              onChange={setPriority}
            />
          </div>

          <Select
            label="Related instance"
            hint="Optional. Links the ticket to one of your apps or databases."
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
            className="scroll-mt-24"
          >
            <option value="">No related instance</option>
            {instances.data?.instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>

          <TextArea
            id="ticket-message"
            label="Message"
            placeholder="What did you expect, and what happened instead?"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            error={bodyError}
            className="scroll-mt-24"
          />

          {create.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
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
  );
}
