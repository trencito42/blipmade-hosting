import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../../icons';
import { parseAnsi, stripAnsi, type AnsiPiece, type AnsiStyle } from '../../lib/ansi';
import { getConsole, sendCommand } from '../../lib/instance-api';
import { useAsync } from '../../lib/useAsync';
import { Panel, SoftButton, StatusPill, useToast } from '../../ui-app';
import { ApiErrorState, type TabProps } from './common';

/**
 * Console.
 *
 * The browser opens the relay of the API, which opens the panel console on
 * the server side, so the panel token never reaches the browser. The stream
 * is opened again when it drops.
 *
 * The output reads like a terminal: the colours of the server are kept, the
 * view follows the newest line until the reader scrolls up, and the prompt is
 * at the foot of the output with the history of the commands on the arrow
 * keys.
 */

/** The lines the console keeps. An older line is dropped, so a chatty server cannot grow the page without end. */
const MAX_LINES = 2000;

/** The commands the history remembers. */
const MAX_HISTORY = 100;

type SocketState = 'connecting' | 'open' | 'closed' | 'error';

/** A line of output, split into the pieces of its style. */
interface Line {
  id: number;
  raw: string;
  pieces: AnsiPiece[];
}

const STATE_TEXT: Record<SocketState, string> = {
  connecting: 'Opening the console.',
  open: 'Connected to the server console.',
  closed: 'The console connection was closed.',
  error: 'The console could not be opened.',
};

function Piece({ piece }: { piece: AnsiPiece }) {
  const { color, bold, dim, underline } = piece.style;
  if (!color && !bold && !dim && !underline) return <>{piece.text}</>;
  return (
    <span style={{ color, fontWeight: bold ? 700 : undefined, opacity: dim ? 0.65 : undefined, textDecoration: underline ? 'underline' : undefined }}>
      {piece.text}
    </span>
  );
}

export default function ConsoleTab({ instance }: TabProps) {
  const { push } = useToast();
  const isCodeServer = instance.product.slug.includes('code-server');
  const [lines, setLines] = useState<Line[]>([]);
  const [state, setState] = useState<SocketState>('connecting');
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const [pinned, setPinned] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const style = useRef<AnsiStyle>({});
  const counter = useRef(0);
  const history = useRef<string[]>([]);
  const cursor = useRef(-1);

  // The credentials decide whether the panel can serve the console at all.
  const credentials = useAsync((signal) => getConsole(instance.id, signal), [instance.id]);

  const append = useCallback((raw: string[]) => {
    const added = raw.map((text): Line => {
      const parsed = parseAnsi(text, style.current);
      style.current = parsed.style;
      counter.current += 1;
      return { id: counter.current, raw: text, pieces: parsed.pieces };
    });
    setLines((previous) => [...previous, ...added].slice(-MAX_LINES));
  }, []);

  useEffect(() => {
    if (credentials.error) return;

    let socket: WebSocket | null = null;
    let closed = false;
    let retry: number | undefined;

    const connect = () => {
      setState('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/api/instances/${instance.id}/console/stream`;
      try {
        socket = new WebSocket(url);
      } catch {
        setState('error');
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => setState('open');
      socket.onmessage = (event) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as { event?: string; message?: string };
          if (parsed?.event === 'connected') {
            setLines([]);
            style.current = {};
            setState('open');
            return;
          }
          if (parsed?.event === 'error') {
            setState('error');
            append([parsed.message ?? 'The console connection failed.']);
            return;
          }
        } catch {
          // Not a control message, so it is console output.
        }
        append(raw.split(/\r?\n/));
      };
      socket.onerror = () => setState('error');
      socket.onclose = () => {
        socketRef.current = null;
        if (closed) return;
        setState('closed');
        // The stream is opened again after a short pause, so a restart of
        // the panel or a dropped network does not end the session.
        retry = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (retry) window.clearTimeout(retry);
      socketRef.current = null;
      socket?.close();
    };
  }, [instance.id, credentials.error, append]);

  // The view follows the newest line, unless the reader scrolled up to read.
  useEffect(() => {
    const element = outputRef.current;
    if (element && pinned) element.scrollTop = element.scrollHeight;
  }, [lines, pinned]);

  const onScroll = () => {
    const element = outputRef.current;
    if (!element) return;
    setPinned(element.scrollHeight - element.scrollTop - element.clientHeight < 24);
  };

  const jump = () => {
    setPinned(true);
    const element = outputRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  };

  const text = () => lines.map((line) => stripAnsi(line.raw)).join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      push('The output is copied.', 'ok');
    } catch {
      push('The output could not be copied.', 'error');
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text()], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${instance.name || 'console'}-console.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const onSend = async () => {
    const value = command.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await sendCommand(instance.id, value);
      history.current = [...history.current.filter((entry) => entry !== value), value].slice(-MAX_HISTORY);
      cursor.current = -1;
      setCommand('');
      setPinned(true);
    } catch (error) {
      push(error instanceof Error ? error.message : 'The command could not be sent.', 'error');
    } finally {
      setSending(false);
    }
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void onSend();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const entries = history.current;
      if (!entries.length) return;
      cursor.current = cursor.current < 0 ? entries.length - 1 : Math.max(0, cursor.current - 1);
      setCommand(entries[cursor.current] ?? '');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (cursor.current < 0) return;
      cursor.current += 1;
      if (cursor.current >= history.current.length) {
        cursor.current = -1;
        setCommand('');
      } else {
        setCommand(history.current[cursor.current] ?? '');
      }
    }
  };

  const inputOff = isCodeServer || state !== 'open' || sending;

  return (
    <div className="grid gap-3">
      <Panel
        title="Console"
        description={STATE_TEXT[state]}
        action={<StatusPill status={state === 'open' ? 'online' : state === 'connecting' ? 'pending' : 'stopped'} label={state === 'open' ? 'Connected' : state === 'connecting' ? 'Connecting' : 'Disconnected'} />}
      >
        {credentials.loading ? (
          <p className="text-[14px] text-ink3">Asking the API for the console.</p>
        ) : credentials.error ? (
          <ApiErrorState error={credentials.error} onRetry={credentials.reload} title="The console is not available" />
        ) : (
          <>
            <div className="relative overflow-hidden rounded-2xl border border-line bg-con">
              <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2 text-[12.5px] text-con-ink/70">
                <Icon name="term" size={14} />
                <span className="min-w-0 flex-1 truncate font-mono">{instance.name}</span>
                <span className="num hidden sm:inline">{lines.length} lines</span>
                <button type="button" onClick={() => void copy()} disabled={lines.length === 0} aria-label="Copy the output" className="grid size-8 place-items-center rounded-lg hover:bg-white/5 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-acc">
                  <Icon name="copy" size={14} />
                </button>
                <button type="button" onClick={download} disabled={lines.length === 0} aria-label="Download the output" className="grid size-8 place-items-center rounded-lg hover:bg-white/5 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-acc">
                  <Icon name="download" size={14} />
                </button>
                <button type="button" onClick={() => setLines([])} disabled={lines.length === 0} aria-label="Clear the output" className="grid size-8 place-items-center rounded-lg hover:bg-white/5 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-acc">
                  <Icon name="close" size={14} />
                </button>
              </div>
              <div
                ref={outputRef}
                onScroll={onScroll}
                tabIndex={0}
                className="h-[min(56dvh,520px)] min-h-[240px] overflow-y-auto overscroll-contain p-4 font-mono text-[13px] leading-[1.55] text-con-ink outline-none focus-visible:ring-2 focus-visible:ring-acc"
                role="log"
                aria-live="off"
                aria-label="Console output"
              >
                {lines.length === 0 ? (
                  <p className="text-con-ink/70">{state === 'open' ? 'Waiting for output.' : 'The console is not connected yet.'}</p>
                ) : (
                  lines.map((line) => (
                    <p key={line.id} className="min-h-[1.55em] break-words whitespace-pre-wrap">
                      {line.pieces.map((piece, index) => (
                        <Piece key={index} piece={piece} />
                      ))}
                    </p>
                  ))
                )}
              </div>
              {!pinned && (
                <button type="button" onClick={jump} className="absolute right-4 bottom-[68px] inline-flex h-9 items-center gap-2 rounded-full bg-acc px-4 text-[13px] font-semibold text-on-acc focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  <Icon name="chevronDown" size={12} />
                  Latest
                </button>
              )}
              <div className="flex items-center gap-2 border-t border-white/5 bg-white/[0.03] pr-2 pl-3">
                <span aria-hidden="true" className="font-mono text-[14px] text-acc">$</span>
                <input
                  aria-label="Console command"
                  value={command}
                  onChange={(event) => {
                    setCommand(event.target.value);
                    cursor.current = -1;
                  }}
                  onKeyDown={onKey}
                  disabled={inputOff}
                  placeholder={isCodeServer ? 'Use the terminal of Code Server' : state === 'open' ? 'Type a command and press Enter' : 'Waiting for the connection'}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-12 min-w-0 flex-1 bg-transparent font-mono text-[16px] text-con-ink outline-none placeholder:text-con-ink/50 disabled:cursor-not-allowed sm:text-[14px]"
                />
                <SoftButton onClick={() => void onSend()} disabled={inputOff || !command.trim()} className="h-9 px-4">
                  {sending ? 'Sending' : 'Send'}
                </SoftButton>
              </div>
            </div>

            {isCodeServer && (
              <p className="mt-2 text-[12.5px] text-ink3">
                Shell commands run in the Code Server integrated terminal.
                {instance.url && <> <a className="text-acc underline" href={instance.url} target="_blank" rel="noopener noreferrer">Open Code Server</a></>}
              </p>
            )}
            <p className="mt-2 text-[12.5px] text-ink3">
              {state === 'open'
                ? 'Arrow up and down walk through the commands you sent. Commands go through the Blipmade API.'
                : 'The console reconnects on its own when the connection drops.'}
            </p>
          </>
        )}
      </Panel>
    </div>
  );
}
