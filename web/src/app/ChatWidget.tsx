import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, get, post, type TicketMessage } from '../lib/api';
import { Icon } from '../icons';
import { Link } from '../router';
import { cn } from '../lib';

/**
 * The live chat of the customer, on every page of the dashboard.
 *
 * It is the same conversation as a ticket: the messages are the ones of `/support/tickets/:id`, written through the
 * ordinary reply route, and the conversation stays in the support center when the panel is closed. The panel says whether a
 * person is connected; when nobody is, the message is saved as a ticket and the panel says that, with no time promised.
 * The live stream only says that something changed: the messages are always read from the API, and a stream that was
 * cut is picked up again by the browser with the number of the last message it had.
 */

interface Conversation {
  id: string;
  number: number;
  status: string;
  channel: string;
}

interface Thread {
  id: string;
  number: number;
  status: string;
  messages: TicketMessage[];
}

interface BotOut {
  kind: string;
  text?: string;
  options?: { id: string; label: string }[];
  articles?: { title: string; url: string; summary: string }[];
  input?: string;
}

interface BotView {
  id: string;
  entries: { from: 'bot' | 'customer'; text: string; links?: { title: string; url: string }[] }[];
  prompt: BotOut | null;
}

const PANEL_ID = 'bm-chat-panel';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [typing, setTyping] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  // The assistant answers first when the company has switched one on; a person is one tap away.
  const [bot, setBot] = useState<BotView | null>(null);
  const botTried = useRef(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  // One key for one draft: pressing Send again after a failure writes the message once.
  const attempt = useRef<{ text: string; key: string } | null>(null);
  const lastTyping = useRef(0);
  const typingTimer = useRef(0);
  const openRef = useRef(open);
  openRef.current = open;
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const loadThread = useCallback(async (id: string) => {
    const data = await get<{ ticket: { id: string; number: number; status: string; messages: TicketMessage[] } }>(`/tickets/${id}`);
    setThread({ id: data.ticket.id, number: data.ticket.number, status: data.ticket.status, messages: data.ticket.messages });
    return data.ticket;
  }, []);

  // The chat that is open is found again after a reload, and in every tab.
  useEffect(() => {
    let live = true;
    get<{ conversation: Conversation | null }>('/support/chat/current')
      .then((res) => {
        if (!live) return;
        if (!res.conversation) {
          void get<{ session: { id: string; transcript: { from: 'bot' | 'customer'; text: string }[]; prompt: BotOut | null } | null }>('/support/bot/current')
            .then((current) => {
              if (live && current.session) {
                botTried.current = true;
                setBot({ id: current.session.id, entries: current.session.transcript, prompt: current.session.prompt });
              }
            })
            .catch(() => undefined);
          return;
        }
        setConversation(res.conversation);
        void loadThread(res.conversation.id).catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [loadThread]);

  // The stream is kept while there is a conversation to follow.
  useEffect(() => {
    if (!conversation || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/support/stream');
    const mine = (event: Event) => {
      try {
        return (JSON.parse((event as MessageEvent).data) as { ticketId?: string }).ticketId === conversationRef.current?.id;
      } catch {
        return false;
      }
    };
    const refresh = (countsAsUnread: boolean) => (event: Event) => {
      if (!mine(event)) return;
      void loadThread(conversation.id).then((ticket) => {
        if (countsAsUnread && !openRef.current && ticket.messages.at(-1)?.author.role !== 'CUSTOMER') setUnread((n) => n + 1);
      }).catch(() => undefined);
    };
    source.addEventListener('message', refresh(true));
    source.addEventListener('status', refresh(false));
    source.addEventListener('attachment', refresh(false));
    // After a cut the browser reconnects by itself; whatever was missed is read again.
    source.addEventListener('resync', () => void loadThread(conversation.id).catch(() => undefined));
    source.addEventListener('typing', (event) => {
      if (!mine(event)) return;
      setTyping(true);
      window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => setTyping(false), 4000);
    });
    return () => {
      window.clearTimeout(typingTimer.current);
      source.close();
    };
  }, [conversation, loadThread]);

  useEffect(() => {
    if (!open) return;
    setUnread(0);
    window.setTimeout(() => field.current?.focus(), 50);
    if (!conversation) void get<{ available: boolean }>('/support/availability').then((res) => setAvailable(res.available)).catch(() => setAvailable(false));
    if (!conversation && !bot && !botTried.current) {
      botTried.current = true;
      // 404 means no assistant is switched on: the chat is the ordinary one.
      void post<{ sessionId: string; state: string; messages: BotOut[] }>('/support/bot/start')
        .then((res) => applyBot(res.sessionId, res.state, res.messages, []))
        .catch(() => undefined);
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversation]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [thread?.messages.length, open]);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

  function entriesOf(messages: BotOut[]): BotView['entries'] {
    return messages
      .filter((out) => out.kind !== 'buttons' && !(out.kind === 'ask'))
      .map((out) => (out.kind === 'articles' ? { from: 'bot' as const, text: 'These pages may help:', links: (out.articles ?? []).map((a) => ({ title: a.title, url: a.url })) } : { from: 'bot' as const, text: out.text ?? '' }))
      .concat(messages.filter((out) => out.kind === 'buttons' || out.kind === 'ask').map((out) => ({ from: 'bot' as const, text: out.text ?? '' })));
  }

  /** Shows what the assistant said; when it handed over, the chat of the person takes its place. */
  function applyBot(sessionId: string, state: string, messages: BotOut[], before: BotView['entries']) {
    const prompt = [...messages].reverse().find((out) => out.kind === 'buttons' || out.kind === 'ask') ?? null;
    const entries = [...before, ...entriesOf(messages)];
    if (state === 'handed_off' || state === 'ended') {
      setBot(null);
      if (state === 'handed_off') {
        void get<{ conversation: Conversation | null }>('/support/chat/current').then(async (res) => {
          if (res.conversation) {
            setConversation(res.conversation);
            await loadThread(res.conversation.id);
          } else {
            // The conversation was kept as a ticket: it is in the support center.
            setBot({ id: sessionId, entries, prompt: null });
          }
        }).catch(() => undefined);
      } else {
        setBot({ id: sessionId, entries, prompt: null });
      }
      return;
    }
    setBot({ id: sessionId, entries, prompt });
  }

  async function answerBot(input: { text?: string; option?: string }, shown: string) {
    if (!bot || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await post<{ sessionId: string; state: string; messages: BotOut[] }>(`/support/bot/${bot.id}/input`, input);
      applyBot(bot.id, res.state, res.messages, [...bot.entries, { from: 'customer', text: shown }]);
      setDraft('');
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'The message could not be sent. Try again.');
    } finally {
      setSending(false);
    }
  }

  async function skipBot() {
    if (!bot) return;
    await post(`/support/bot/${bot.id}/skip`).catch(() => undefined);
    setBot(null);
    window.setTimeout(() => field.current?.focus(), 50);
  }

  async function send() {
    if (bot && !conversation) {
      const text = draft.trim();
      if (text) await answerBot({ text }, text);
      return;
    }
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    if (!attempt.current || attempt.current.text !== text) attempt.current = { text, key: crypto.randomUUID() };
    try {
      if (!conversation) {
        const res = await post<{ conversation: Conversation; mode: 'chat' | 'ticket' }>('/support/chat', { message: text });
        setConversation({ ...res.conversation, status: 'open' });
        await loadThread(res.conversation.id);
      } else {
        await api(`/tickets/${conversation.id}/replies`, { method: 'POST', body: { body: text }, headers: { 'Idempotency-Key': attempt.current.key } });
        await loadThread(conversation.id);
      }
      attempt.current = null;
      setDraft('');
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'The message could not be sent. It is still here: try again.');
    } finally {
      setSending(false);
    }
  }

  function onType(value: string) {
    setDraft(value);
    const now = Date.now();
    if (conversation && now - lastTyping.current > 3000) {
      lastTyping.current = now;
      void post(`/support/chat/${conversation.id}/typing`).catch(() => undefined);
    }
  }

  async function toTicket() {
    if (!conversation) return;
    try {
      await post(`/support/chat/${conversation.id}/convert`);
      setConversation(null);
      setThread(null);
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not turn the chat into a ticket.');
    }
  }

  async function end() {
    if (!conversation) return;
    try {
      await post(`/tickets/${conversation.id}/close`);
      await loadThread(conversation.id);
      setRating(0);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not end the chat.');
    }
  }

  async function rate(value: number) {
    if (!conversation) return;
    await post(`/support/chat/${conversation.id}/rating`, { rating: value }).catch(() => undefined);
    setRating(null);
    setConversation(null);
    setThread(null);
  }

  const messages = thread?.messages ?? [];
  const closed = thread?.status === 'CLOSED' || thread?.status === 'closed';

  return (
    <div data-print-hide="">
      <button
        ref={launcher}
        type="button"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-acc text-on-acc shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-acc-h lg:bottom-6"
      >
        <Icon name="chat" size={22} />
        <span className="sr-only">{open ? 'Close the chat' : 'Open the chat'}</span>
        {unread > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-[11px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {unread > 0 && !open && <p className="sr-only" role="status">{unread} new {unread === 1 ? 'message' : 'messages'} in the chat</p>}

      {open && (
        <section
          id={PANEL_ID}
          role="dialog"
          aria-label="Chat with support"
          className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-bg pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] sm:inset-auto sm:bottom-24 sm:right-4 sm:h-[min(600px,calc(100dvh-8rem))] sm:w-[380px] sm:rounded-3xl sm:border sm:border-line sm:pb-0 sm:pt-0 sm:shadow-2xl lg:bottom-24"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-semibold text-ink">Chat with support</h2>
              <p className="truncate text-[12.5px] text-ink3">
                {conversation ? `Conversation #${thread?.number ?? conversation.number}` : available === null ? 'Checking…' : available ? 'A person is connected.' : 'Nobody is connected right now.'}
              </p>
            </div>
            <button type="button" onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink2 hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
              <span aria-hidden="true" className="text-[22px] leading-none">×</span>
              <span className="sr-only">Close</span>
            </button>
          </header>

          <div ref={log} role="log" aria-live="polite" aria-label="Messages" className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {bot && !conversation ? (
              <div className="grid gap-2">
                <ul className="grid gap-2">
                  {bot.entries.map((entry, index) => (
                    <li key={index} className={cn('flex flex-col', entry.from === 'customer' ? 'items-end' : 'items-start')}>
                      <p className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14.5px]', entry.from === 'customer' ? 'bg-acc text-on-acc' : 'bg-s2 text-ink')}>{entry.text}</p>
                      {entry.links && (
                        <ul className="mt-1 grid gap-1">
                          {entry.links.map((link) => (
                            <li key={link.url}><a href={link.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[13.5px] text-acc underline">{link.title}</a></li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
                {bot.prompt && (bot.prompt.kind === 'buttons' || bot.prompt.input === 'service') && (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choose">
                    {(bot.prompt.options ?? []).map((option) => (
                      <button key={option.id} type="button" disabled={sending} onClick={() => void answerBot({ option: option.id }, option.label)} className="min-h-11 rounded-full border border-line bg-card px-3.5 text-[14px] font-medium text-ink hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => void skipBot()} className="min-h-11 justify-self-start text-[13.5px] text-ink2 underline">Talk to a person instead</button>
              </div>
            ) : messages.length === 0 ? (
              <div className="grid gap-2 py-6 text-[14px] text-ink2">
                <p className="font-medium text-ink">How can we help?</p>
                {available === false ? (
                  <p>Nobody is online right now. Write your message anyway: it is saved as a ticket in your support center, and you get an email when it is answered. We do not promise a time.</p>
                ) : (
                  <p>Write a message. A person of the team will answer here.</p>
                )}
              </div>
            ) : (
              <ul className="grid gap-2">
                {messages.map((message) => {
                  const mine = message.author.role === 'CUSTOMER' || false;
                  return (
                    <li key={message.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                      <p className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14.5px]', mine ? 'bg-acc text-on-acc' : 'bg-s2 text-ink')}>{message.body}</p>
                      <span className="mt-0.5 px-1 text-[11.5px] text-ink3">{mine ? 'You' : message.author.name ?? 'Support'} · {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {typing && <p className="pt-2 text-[12.5px] text-ink3" role="status">A person is typing…</p>}
          </div>

          {rating !== null ? (
            <div className="grid gap-2 border-t border-line px-4 py-3">
              <p className="text-[14px] font-medium text-ink">How was this chat?</p>
              <div className="flex gap-1.5" role="group" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button key={value} type="button" onClick={() => void rate(value)} className="h-11 min-w-11 flex-1 rounded-xl border border-line bg-card text-[15px] font-semibold text-ink hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                    {value}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => void rate(0)} className="h-11 text-[13.5px] text-ink3 underline">Skip</button>
            </div>
          ) : closed ? (
            <p className="border-t border-line px-4 py-3 text-[13.5px] text-ink2">This chat is closed.</p>
          ) : (
            <form
              className="grid gap-2 border-t border-line px-3 py-3"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
              <div className="flex items-end gap-2">
                <label className="sr-only" htmlFor="bm-chat-field">Your message</label>
                <textarea
                  id="bm-chat-field"
                  ref={field}
                  value={draft}
                  rows={2}
                  maxLength={4000}
                  onChange={(event) => onType(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Write a message"
                  className="min-h-11 flex-1 resize-none rounded-2xl border border-line bg-card px-3.5 py-2.5 text-[15px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-acc"
                />
                <button type="submit" disabled={sending || !draft.trim()} className="h-11 shrink-0 rounded-full bg-acc px-4 text-[14px] font-semibold text-on-acc disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h">
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
              {conversation && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                  <button type="button" onClick={() => void toTicket()} className="min-h-11 text-ink2 underline">Turn into a ticket</button>
                  <button type="button" onClick={() => void end()} className="min-h-11 text-ink2 underline">End the chat</button>
                  <Link to={`/app/tickets/${conversation.id}`} className="inline-flex min-h-11 items-center text-ink2 underline">Open in support</Link>
                </div>
              )}
            </form>
          )}
        </section>
      )}
    </div>
  );
}
