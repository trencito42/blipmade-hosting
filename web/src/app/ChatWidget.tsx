import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, get, post, type TicketMessage } from '../lib/api';
import { Icon } from '../icons';
import { Link } from '../router';
import { cn } from '../lib';
import { useVisualViewport } from '../lib/useVisualViewport';

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
  /** The person the customer is talking to: who answered last, or who the conversation is assigned to. */
  agent: { name: string; avatar: string | null } | null;
}

interface BotOut {
  kind: string;
  text?: string;
  ai?: boolean;
  options?: { id: string; label: string }[];
  articles?: { title: string; url: string; summary: string }[];
  items?: string[];
  input?: string;
}

interface BotView {
  id: string;
  /** The flow reached its end: the customer is asked how it was. */
  ended?: boolean;
  entries: { from: 'bot' | 'customer'; text: string; ai?: boolean; links?: { title: string; url: string }[]; suggestions?: string[] }[];
  prompt: BotOut | null;
  /** How the assistant is shown at the top: its name, its picture, and whether it answers with an AI. */
  persona?: { name: string; avatarUrl: string | null; ai: boolean };
}

/** The picture of the assistant at the top of the chat; without one, or when it does not load, its initial. */
function Avatar({ persona }: { persona?: BotView['persona'] }) {
  const [failed, setFailed] = useState(false);
  const name = persona?.name || 'Assistant';
  return persona?.avatarUrl && !failed ? (
    <img src={persona.avatarUrl} alt="" width={40} height={40} onError={() => setFailed(true)} className="size-10 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
  ) : (
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-acc text-[16px] font-bold text-on-acc">{name.slice(0, 1).toUpperCase()}</span>
  );
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
  const [botRating, setBotRating] = useState<number | null>(null);
  const [botComment, setBotComment] = useState('');
  const viewport = useVisualViewport(open);
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
    const data = await get<{ ticket: { id: string; number: number; status: string; messages: TicketMessage[]; agent?: Thread['agent'] } }>(`/tickets/${id}`);
    setThread({ id: data.ticket.id, number: data.ticket.number, status: data.ticket.status, messages: data.ticket.messages, agent: data.ticket.agent ?? null });
    return data.ticket;
  }, []);

  // A visitor who chatted as a guest and then signed in brings the conversation along. Without a credential of a guest it answers 401, which is fine.
  const [claimed, setClaimed] = useState(0);
  useEffect(() => {
    void post<{ claimed: number }>('/support/guest/claim').then((res) => setClaimed(res.claimed)).catch(() => undefined);
  }, []);

  // The chat that is open is found again after a reload, and in every tab.
  useEffect(() => {
    let live = true;
    get<{ conversation: Conversation | null }>('/support/chat/current')
      .then((res) => {
        if (!live) return;
        if (!res.conversation) {
          void get<{ session: { id: string; transcript: { from: 'bot' | 'customer'; text: string }[]; prompt: BotOut | null; bot?: BotView['persona'] } | null }>('/support/bot/current')
            .then((current) => {
              if (live && current.session) {
                botTried.current = true;
                setBot({ id: current.session.id, entries: current.session.transcript, prompt: current.session.prompt, persona: current.session.bot });
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
  }, [loadThread, claimed]);

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
      void post<{ sessionId: string; state: string; messages: BotOut[]; bot?: BotView['persona'] }>('/support/bot/start')
        .then((res) => applyBot(res.sessionId, res.state, res.messages, [], res.bot))
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
    const shown: BotView['entries'] = messages
      .filter((out) => out.kind !== 'buttons' && out.kind !== 'ask')
      .map((out) => (out.kind === 'suggestions' ? { from: 'bot', text: '', suggestions: out.items ?? [] } : out.kind === 'articles' ? { from: 'bot', text: 'These may help:', links: (out.articles ?? []).map((a) => ({ title: a.title, url: a.url })) } : { from: 'bot', text: out.text ?? '', ai: out.ai }));
    // The question that waits for an answer is the last thing said.
    const asks: BotView['entries'] = messages.filter((out) => out.kind === 'buttons' || out.kind === 'ask').map((out) => ({ from: 'bot', text: out.text ?? '' }));
    return [...shown, ...asks];
  }

  /** Shows what the assistant said; when it handed over, the chat of the person takes its place. */
  function applyBot(sessionId: string, state: string, messages: BotOut[], before: BotView['entries'], persona?: BotView['persona']) {
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
            setBot({ id: sessionId, entries, prompt: null, persona });
          }
        }).catch(() => undefined);
      } else {
        // The flow reached its end: the entries stay on the screen and the customer is asked how it was.
        setBot({ id: sessionId, entries, prompt: null, ended: true, persona });
      }
      return;
    }
    setBot({ id: sessionId, entries, prompt, persona });
  }

  async function answerBot(input: { text?: string; option?: string }, shown: string) {
    if (!bot || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await post<{ sessionId: string; state: string; messages: BotOut[]; bot?: BotView['persona'] }>(`/support/bot/${bot.id}/input`, input);
      applyBot(bot.id, res.state, res.messages, [...bot.entries, { from: 'customer', text: shown }], res.bot ?? bot.persona);
      setDraft('');
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'The message could not be sent. Try again.');
    } finally {
      setSending(false);
    }
  }

  async function rateBot(value: number | null) {
    if (!bot) return;
    if (value) await post(`/support/bot/${bot.id}/rating`, { rating: value, comment: botComment.trim() || undefined }).catch(() => undefined);
    setBot(null);
    setBotRating(null);
    setBotComment('');
    // The next time the panel opens, a new conversation with the assistant starts.
    botTried.current = false;
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
          style={viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined}
          className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-bg pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] sm:inset-auto sm:bottom-24 sm:right-4 sm:h-[min(600px,calc(100dvh-8rem))] sm:w-[380px] sm:rounded-3xl sm:border sm:border-line sm:pb-0 sm:pt-0 sm:shadow-2xl lg:bottom-24"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {bot && !conversation && <Avatar persona={bot.persona} />}
              {conversation && thread?.agent && <Avatar persona={{ name: thread.agent.name, avatarUrl: thread.agent.avatar, ai: false }} />}
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 truncate text-[16px] font-semibold text-ink">
                  <span className="truncate">{bot && !conversation ? bot.persona?.name || 'Assistant' : conversation && thread?.agent ? thread.agent.name : 'Chat with support'}</span>
                  {bot && !conversation && bot.persona?.ai && <span className="shrink-0 rounded-full bg-acc-bg px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-acc">AI</span>}
                </h2>
                <p className="truncate text-[12.5px] text-ink3">
                  {conversation ? `${thread?.agent ? 'Support · ' : ''}Conversation #${thread?.number ?? conversation.number}` : bot ? (bot.persona?.ai ? 'Answers with AI, and can be wrong · a person is one tap away' : 'Automated assistant · a person is one tap away') : available === null ? 'Checking…' : available ? 'A person is connected.' : 'Nobody is connected right now.'}
                </p>
              </div>
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
                  {bot.entries.map((entry, index, all) => {
                    // Only the latest suggestions are offered, and only until the customer writes again.
                    const lastSuggestions = all.reduce((found, item, i) => (item.suggestions ? i : item.from === 'customer' ? -1 : found), -1);
                    return (
                    <li key={index} className={cn('flex flex-col', entry.from === 'customer' ? 'items-end' : 'items-start')}>
                      {entry.text && <p className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14.5px]', entry.from === 'customer' ? 'bg-acc text-on-acc' : 'bg-s2 text-ink')}>{entry.text}</p>}
                      {entry.suggestions && index === lastSuggestions && !sending && (
                        <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="You may also ask">
                          {entry.suggestions.map((item) => (
                            <button key={item} type="button" onClick={() => void answerBot({ text: item }, item)} className="min-h-11 rounded-full border border-line bg-card px-3.5 text-[14px] text-ink hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">{item}</button>
                          ))}
                        </div>
                      )}
                      {entry.ai && <span className="mt-0.5 px-1 text-[11px] text-ink3">AI answer, it can be wrong</span>}
                      {entry.links && (
                        <ul className="mt-1 grid gap-1">
                          {entry.links.map((link) => (
                            <li key={link.url || link.title}>{link.url ? <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[13.5px] text-acc underline">{link.title}</a> : <span className="inline-flex min-h-8 items-center text-[13.5px] text-ink2">{link.title}</span>}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                    );
                  })}
                  {sending && (
                    <li className="flex flex-col items-start" role="status">
                      <span className="sr-only">The assistant is writing</span>
                      <span aria-hidden="true" className="flex gap-1 rounded-2xl bg-s2 px-3.5 py-3">
                        {[0, 1, 2].map((dot) => <span key={dot} className="size-2 rounded-full bg-ink3 motion-safe:animate-pulse" style={{ animationDelay: `${dot * 160}ms` }} />)}
                      </span>
                    </li>
                  )}
                </ul>
                {bot.prompt && !sending && (bot.prompt.kind === 'buttons' || bot.prompt.input === 'service') && (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choose">
                    {(bot.prompt.options ?? []).map((option) => (
                      <button key={option.id} type="button" disabled={sending} onClick={() => void answerBot({ option: option.id }, option.label)} className="min-h-11 rounded-full border border-line bg-card px-3.5 text-[14px] font-medium text-ink hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
                {!bot.ended && !(bot.prompt?.options ?? []).some((option) => /agent|person|human/i.test(option.label)) && <button type="button" onClick={() => void skipBot()} className="min-h-11 justify-self-start text-[13.5px] text-ink2 underline">Talk to a person instead</button>}
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

          {bot?.ended && !conversation ? (
            <div className="grid gap-2 border-t border-line px-4 py-3">
              <p className="text-[14px] font-medium text-ink">How was the assistant?</p>
              <div className="flex gap-1.5" role="group" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button key={value} type="button" aria-pressed={botRating === value} onClick={() => setBotRating(value)} className={cn('h-11 min-w-11 flex-1 rounded-xl border text-[16px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc', botRating === value ? 'border-acc bg-acc text-on-acc' : 'border-line bg-card text-ink hover:bg-s2')}>{value}</button>
                ))}
              </div>
              <label className="sr-only" htmlFor="bm-bot-comment">Comment (optional)</label>
              <textarea id="bm-bot-comment" value={botComment} onChange={(event) => setBotComment(event.target.value)} rows={2} maxLength={500} placeholder="Anything we should know? (optional)" className="rounded-xl border border-line bg-card px-3 py-2 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-acc" />
              <div className="flex gap-2">
                <button type="button" disabled={!botRating} onClick={() => void rateBot(botRating)} className="h-11 flex-1 rounded-full bg-acc px-4 text-[14px] font-semibold text-on-acc disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h">Send</button>
                <button type="button" onClick={() => void rateBot(null)} className="h-11 rounded-full px-4 text-[14px] text-ink2 underline">Skip</button>
              </div>
            </div>
          ) : rating !== null ? (
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
                  className="min-h-11 flex-1 resize-none rounded-2xl border border-line bg-card px-3.5 py-2.5 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-acc"
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
