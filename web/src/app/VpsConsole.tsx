import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { SoftButton } from '../ui-app';

/**
 * The serial console of a server. It is the same console you get when the network or SSH is
 * broken: log in with the account of the image (the password of the user is not set, so use
 * it to repair SSH, or to read what the machine prints while it boots).
 */
export default function VpsConsole({ path }: { path: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!host.current) return;
    setState('connecting');
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 13,
      theme: { background: '#090b0a', foreground: '#f1f5ef', cursor: '#4ee595' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}${path}`);
    socket.onopen = () => {
      setState('open');
      socket.send(`\u0000resize:${term.cols}:${term.rows}`);
      socket.send('\r');
    };
    socket.onmessage = (event) => term.write(typeof event.data === 'string' ? event.data : '');
    socket.onclose = () => setState('closed');
    socket.onerror = () => setState('closed');
    const data = term.onData((input) => socket.readyState === WebSocket.OPEN && socket.send(input));
    const onResize = () => {
      fit.fit();
      if (socket.readyState === WebSocket.OPEN) socket.send(`\u0000resize:${term.cols}:${term.rows}`);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      data.dispose();
      socket.close();
      term.dispose();
    };
  }, [path, attempt]);

  return (
    <div className="grid gap-3">
      <div ref={host} className="h-[420px] overflow-hidden rounded-2xl border border-line bg-bg p-2" aria-label="Server console" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-[13px] text-ink3">
          {state === 'connecting' ? 'Connecting…' : state === 'open' ? 'Connected. Press Enter if the screen is empty.' : 'The console is closed.'}
        </p>
        {state === 'closed' && <SoftButton onClick={() => setAttempt((n) => n + 1)}>Reconnect</SoftButton>}
      </div>
    </div>
  );
}
