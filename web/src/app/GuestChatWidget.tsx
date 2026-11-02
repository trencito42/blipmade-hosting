import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, get, post } from '../lib/api';
import { Icon } from '../icons';
import { Link } from '../router';
import { cn } from '../lib';
import { useSession } from '../session';
import { useVisualViewport } from '../lib/useVisualViewport';

/**
 * The chat of the public site, for a visitor who has not signed in.
 *
 * It exists only when an operator has switched it on, and never for a person who is signed in (they have the chat of the
 * dashboard). The visitor agrees to the notice before anything is sent. The panel says plainly that nobody can write back to
 * them unless they sign in: a guest has no address that is trusted, so no email is sent. After signing in, the conversation
 * moves to the account.
 */

interface Thread {
  conversation: { id: string; number: number; status: string; channel: string } | null;
  messages: { id: string; from: 'you' | 'support'; body: string; at: string }[];
}

export default function GuestChatWidget() {
  const session = useSession() as { user: unknown | null; loading?: boolean };
  const [config, setConfig] = useState<{ enabled: boolean; notice: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<Thread | null>(null);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'chat' | 'ticket' | null>(null);
  const [unread, setUnread] = useState(0);
  const launcher = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const viewport = useVisualViewport(open);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    get<{ enabled: boolean; notice: string | null }>('/support/guest/config').then(setConfig).catch(() => setConfig({ enabled: false, notice: null }));
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await get<Thread>('/support/guest/thread');
      setThread((previous) => {
        const last = data.messages.at(-1);
        if (previous && last && last.from === 'support' && last.id !== previous.messages.at(-1)?.id && !openRef.current) setUnread((n) => n + 1);
        return data;
      });
    } catch {
      setThread(null);
    }
  }, []);

  const enabled = Boolean(config?.enabled) && !session.user;
  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  // The stream says that something changed; the messages are read again. The browser reconnects by itself after a cut.
  useEffect(() => {
    if (!enabled || !thread?.conversation || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/support/guest/stream');
    const again = () => void load();
    source.addEventListener('message', again);
    source.addEventListener('status', again);
    source.addEventListener('resync', again);
    return () => source.close();
  }, [enabled, thread?.conversation?.id, load]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [thread?.messages.length, open]);
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  if (!enabled) return null;

  const closed = thread?.conversation?.status === 'closed';
  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ mode: 'chat' | 'ticket' }>('/support/guest/start', { name, message, contact: contact || undefined, consent });
      setMode(res.mode);
      setMessage('');
      await load();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'The chat could not be started. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await post('/support/guest/messages', { body: text });
      setDraft('');
      await load();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'The message could not be sent. It is still here: try again.');
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    await post('/support/guest/end').catch(() => undefined);
    await load();
  }

  return (
    <div data-print-hide="">
      <button
        ref={launcher}
        type="button"
        aria-expanded={open}
        aria-controls="bm-guest-chat"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-acc text-on-acc shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
      >
        <Icon name="chat" size={22} />
        <span className="sr-only">{open ? 'Close the chat' : 'Open the chat'}</span>
        {unread > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-[11px] font-bold text-white">{unread}</span>}
      </button>

      {open && (
        <section
          id="bm-guest-chat"
          role="dialog"
          aria-label="Chat with us"
          style={viewport ? { top: viewport.top, height: viewport.height, bottom: 'auto' } : undefined}
          className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-bg pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] sm:inset-auto sm:bottom-24 sm:right-4 sm:h-[min(600px,calc(100dvh-8rem))] sm:w-[380px] sm:rounded-3xl sm:border sm:border-line sm:pb-0 sm:pt-0 sm:shadow-2xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-semibold text-ink">Chat with us</h2>
              <p className="truncate text-[12.5px] text-ink3">{thread?.conversation ? `Conversation #${thread.conversation.number}` : 'You are not signed in'}</p>
            </div>
            <button type="button" onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink2 hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
              <span aria-hidden="true" className="text-[22px] leading-none">×</span>
              <span className="sr-only">Close</span>
            </button>
          </header>

          {!thread?.conversation ? (
            <form
              className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-4 py-4"
              onSubmit={(event) => {
                event.preventDefault();
                void begin();
              }}
            >
              <label className="grid gap-1 text-[13.5px] font-medium text-ink">
                Your name
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required autoComplete="given-name" className="h-12 rounded-xl border border-line bg-card px-3 text-[16px] font-normal text-ink outline-none focus-visible:ring-2 focus-visible:ring-acc" />
              </label>
              <label className="grid gap-1 text-[13.5px] font-medium text-ink">
                How can we help?
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} required rows={4} className="rounded-xl border border-line bg-card px-3 py-2.5 text-[16px] font-normal text-ink outline-none focus-visible:ring-2 focus-visible:ring-acc" />
              </label>
              <label className="grid gap-1 text-[13.5px] font-medium text-ink">
                Email or phone, if you want us to be able to reach you (optional, not verified)
                <input value={contact} onChange={(event) => setContact(event.target.value)} maxLength={200} className="h-12 rounded-xl border border-line bg-card px-3 text-[16px] font-normal text-ink outline-none focus-visible:ring-2 focus-visible:ring-acc" />
              </label>
              <label className="flex items-start gap-2 text-[13px] text-ink2">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-5 shrink-0" />
                <span>{config?.notice}</span>
              </label>
              {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
              <button type="submit" disabled={busy || !consent || !name.trim() || !message.trim()} className="h-12 rounded-full bg-acc px-5 text-[15px] font-semibold text-on-acc disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h">
                {busy ? 'Starting…' : 'Start the chat'}
              </button>
            </form>
          ) : (
            <>
              <div ref={log} role="log" aria-live="polite" aria-label="Messages" className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <ul className="grid gap-2">
                  {thread.messages.map((entry) => (
                    <li key={entry.id} className={cn('flex flex-col', entry.from === 'you' ? 'items-end' : 'items-start')}>
                      <p className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14.5px]', entry.from === 'you' ? 'bg-acc text-on-acc' : 'bg-s2 text-ink')}>{entry.body}</p>
                      <span className="mt-0.5 px-1 text-[11.5px] text-ink3">{entry.from === 'you' ? 'You' : 'Support'} · {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </li>
                  ))}
                </ul>
                {(mode === 'ticket' || thread.conversation.channel === 'ticket') && !closed && (
                  <p className="mt-3 rounded-xl bg-s2 px-3 py-2 text-[13px] text-ink2">Nobody is online right now. Your message is saved. We cannot write to you unless you sign in, so keep this page open or <Link to="/login" className="underline">sign in</Link> (or <Link to="/register" className="underline">create an account</Link>) and the conversation moves to your account. We do not promise a time.</p>
                )}
              </div>
              {closed ? (
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
                    <label className="sr-only" htmlFor="bm-guest-field">Your message</label>
                    <textarea
                      id="bm-guest-field"
                      value={draft}
                      rows={2}
                      maxLength={4000}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void send();
                        }
                      }}
                      placeholder="Write a message"
                      className="min-h-11 flex-1 resize-none rounded-2xl border border-line bg-card px-3.5 py-2.5 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-acc"
                    />
                    <button type="submit" disabled={busy || !draft.trim()} className="h-11 shrink-0 rounded-full bg-acc px-4 text-[14px] font-semibold text-on-acc disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h">
                      {busy ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                  <button type="button" onClick={() => void end()} className="min-h-11 justify-self-start text-[13px] text-ink2 underline">End the chat</button>
                </form>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
