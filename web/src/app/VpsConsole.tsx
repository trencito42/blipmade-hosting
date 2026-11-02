import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { StatusPill, SoftButton } from '../ui-app';

/**
 * The serial console of a server.
 *
 * It is the console you get when the network or SSH is broken: log in with the account of the image, repair SSH, or read what
 * the machine prints while it boots. It is a real terminal, so the screen is a terminal; around it are the things a terminal in
 * a browser lacks: the state of the connection, a reconnect that happens by itself, a bar of the keys a phone does not have
 * (Esc, Tab, Ctrl+C, the arrows), a line for a command with its history, the size of the text, copy, clear and the whole screen.
 */

const KEYS: { label: string; aria: string; send: string }[] = [
  { label: 'Esc', aria: 'Escape', send: '\u001b' },
  { label: 'Tab', aria: 'Tab', send: '\t' },
  { label: 'Ctrl+C', aria: 'Control C', send: '\u0003' },
  { label: 'Ctrl+D', aria: 'Control D', send: '\u0004' },
  { label: '↑', aria: 'Arrow up', send: '\u001b[A' },
  { label: '↓', aria: 'Arrow down', send: '\u001b[B' },
  { label: '←', aria: 'Arrow left', send: '\u001b[D' },
  { label: '→', aria: 'Arrow right', send: '\u001b[C' },
];

const SIZES = [12, 13, 14, 16, 18];
const MAX_RETRIES = 5;
type State = 'connecting' | 'open' | 'reconnecting' | 'closed';

const THEME = {
  background: '#0b0f0d',
  foreground: '#e8efe9',
  cursor: '#4ee595',
  cursorAccent: '#0b0f0d',
  selectionBackground: '#2c4a3a',
  black: '#1b231f', red: '#ff6b6b', green: '#4ee595', yellow: '#f5c542', blue: '#6ea8fe', magenta: '#d291ff', cyan: '#5fd3d3', white: '#e8efe9',
  brightBlack: '#5b6a62', brightRed: '#ff8e8e', brightGreen: '#7af0b3', brightYellow: '#ffd97a', brightBlue: '#9cc2ff', brightMagenta: '#e3b5ff', brightCyan: '#8fe8e8', brightWhite: '#ffffff',
};

const readSize = () => {
  try {
    const value = Number(localStorage.getItem('bm_console_size'));
    return SIZES.includes(value) ? value : 14;
  } catch {
    return 14;
  }
};

export default function VpsConsole({ path, name }: { path: string; name?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<State>('connecting');
  const [attempt, setAttempt] = useState(0);
  const [size, setSize] = useState(readSize);
  const [full, setFull] = useState(false);
  const [line, setLine] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const history = useRef<string[]>([]);
  const cursor = useRef(-1);

  const send = useCallback((text: string) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(text);
    termRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!host.current) return;
    let alive = true;
    let retries = 0;
    let timer = 0;
    const term = new Terminal({ cursorBlink: true, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: readSize(), scrollback: 5000, theme: THEME, allowProposedApi: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const connect = () => {
      setState(retries === 0 ? 'connecting' : 'reconnecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}${path}`);
      socketRef.current = socket;
      socket.onopen = () => {
        retries = 0;
        setState('open');
        socket.send(`\u0000resize:${term.cols}:${term.rows}`);
        socket.send('\r');
      };
      socket.onmessage = (event) => term.write(typeof event.data === 'string' ? event.data : '');
      const dropped = () => {
        if (!alive) return;
        // A break is tried again a few times, a little later each time; after that the reader decides.
        if (retries < MAX_RETRIES) {
          retries += 1;
          setState('reconnecting');
          timer = window.setTimeout(connect, Math.min(8000, 800 * 2 ** retries));
        } else {
          setState('closed');
        }
      };
      socket.onclose = dropped;
      socket.onerror = () => socket.close();
    };
    connect();

    const data = term.onData((input) => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(input);
    });
    const refit = () => {
      fit.fit();
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(`\u0000resize:${term.cols}:${term.rows}`);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refit);
    observer?.observe(host.current);
    window.addEventListener('resize', refit);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener('resize', refit);
      observer?.disconnect();
      data.dispose();
      socketRef.current?.close();
      term.dispose();
      termRef.current = null;
    };
  }, [path, attempt]);

  // The size of the text, and the whole screen, change the room the terminal has: it is fitted again.
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = size;
      fitRef.current?.fit();
    }
    try {
      localStorage.setItem('bm_console_size', String(size));
    } catch {
      /* the size is simply not remembered */
    }
  }, [size]);
  useEffect(() => {
    const id = window.setTimeout(() => fitRef.current?.fit(), 50);
    if (full) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setFull(false);
      window.addEventListener('keydown', onKey);
      return () => {
        window.clearTimeout(id);
        document.body.style.overflow = previous;
        window.removeEventListener('keydown', onKey);
      };
    }
    return () => window.clearTimeout(id);
  }, [full]);

  const copyScreen = async () => {
    const term = termRef.current;
    if (!term) return;
    const selected = term.getSelection();
    let text = selected;
    if (!text) {
      const buffer = term.buffer.active;
      const rows: string[] = [];
      for (let i = 0; i < buffer.length; i++) rows.push(buffer.getLine(i)?.translateToString(true) ?? '');
      text = rows.join('\n').replace(/\n+$/, '');
    }
    try {
      await navigator.clipboard.writeText(text);
      setNote(selected ? 'Selection copied.' : 'Screen copied.');
    } catch {
      setNote('The browser did not allow copying.');
    }
    window.setTimeout(() => setNote(null), 2500);
  };

  const paste = async () => {
    try {
      send(await navigator.clipboard.readText());
    } catch {
      setNote('The browser did not allow pasting. Use the paste of the keyboard in the terminal.');
      window.setTimeout(() => setNote(null), 3000);
    }
  };

  const submit = () => {
    const text = line;
    if (!text) return;
    send(`${text}\r`);
    history.current = [text, ...history.current.filter((entry) => entry !== text)].slice(0, 100);
    cursor.current = -1;
    setLine('');
  };

  const status = state === 'open' ? 'Connected' : state === 'closed' ? 'Closed' : state === 'reconnecting' ? 'Reconnecting' : 'Connecting';

  return (
    <div className={full ? 'fixed inset-0 z-50 grid grid-rows-[auto_minmax(0,1fr)_auto] gap-2 bg-bg p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]' : 'grid gap-3'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusPill status={state === 'open' ? 'online' : state === 'closed' ? 'stopped' : 'provisioning'} label={status} />
          <p role="status" className="min-w-0 truncate text-[13px] text-ink3">
            {note ?? (state === 'open' ? (name ? `${name} · press Enter if the screen is empty` : 'Press Enter if the screen is empty') : state === 'reconnecting' ? 'The connection dropped. Trying again…' : state === 'closed' ? 'The console is closed.' : 'Opening the console…')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <SoftButton onClick={() => setSize(SIZES[Math.max(0, SIZES.indexOf(size) - 1)]!)} disabled={size === SIZES[0]} aria-label="Smaller text">A−</SoftButton>
          <SoftButton onClick={() => setSize(SIZES[Math.min(SIZES.length - 1, SIZES.indexOf(size) + 1)]!)} disabled={size === SIZES.at(-1)} aria-label="Larger text">A+</SoftButton>
          <SoftButton onClick={() => void copyScreen()}>Copy</SoftButton>
          <SoftButton onClick={() => void paste()}>Paste</SoftButton>
          <SoftButton onClick={() => termRef.current?.clear()}>Clear</SoftButton>
          <SoftButton onClick={() => setFull((value) => !value)} aria-pressed={full}>{full ? 'Exit full screen' : 'Full screen'}</SoftButton>
          {state === 'closed' && <SoftButton onClick={() => setAttempt((n) => n + 1)}>Reconnect</SoftButton>}
        </div>
      </div>

      <div ref={host} aria-label="Server console" className={`overflow-hidden rounded-2xl border border-line p-2 ${full ? 'min-h-0' : 'h-[min(62vh,520px)]'}`} style={{ background: THEME.background }} />

      <div className="grid gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 bm-hide-scroll" role="group" aria-label="Keys">
          {KEYS.map((key) => (
            <button key={key.label} type="button" aria-label={key.aria} disabled={state !== 'open'} onClick={() => send(key.send)} className="h-11 min-w-12 shrink-0 rounded-xl border border-line bg-card px-3 font-mono text-[13px] text-ink hover:bg-s2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
              {key.label}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="sr-only" htmlFor="vps-console-line">A command to send to the server</label>
          <input
            id="vps-console-line"
            value={line}
            onChange={(event) => setLine(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' && history.current.length > 0) {
                event.preventDefault();
                cursor.current = Math.min(history.current.length - 1, cursor.current + 1);
                setLine(history.current[cursor.current]!);
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                cursor.current = Math.max(-1, cursor.current - 1);
                setLine(cursor.current === -1 ? '' : history.current[cursor.current]!);
              }
            }}
            disabled={state !== 'open'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Type a command and press Enter"
            className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 font-mono text-[16px] text-ink outline-none placeholder:text-ink3 focus-visible:ring-2 focus-visible:ring-acc disabled:opacity-60"
          />
          <button type="submit" disabled={state !== 'open' || !line} className="h-12 shrink-0 rounded-xl bg-acc px-5 text-[14px] font-semibold text-on-acc disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h">Send</button>
        </form>
      </div>
    </div>
  );
}
