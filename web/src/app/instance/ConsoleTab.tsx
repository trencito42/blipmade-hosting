import { useEffect, useRef, useState } from 'react';
import { getConsole, sendCommand } from '../../lib/instance-api';
import { useAsync } from '../../lib/useAsync';
import { Panel, PrimaryButton, SoftButton, StatusPill, TextInput, useToast } from '../../ui-app';
import { ApiErrorState, type TabProps } from './common';

/**
 * Console.
 *
 * The browser opens the relay of the API, which opens the panel console on
 * the server side, so the panel token never reaches the browser. The stream
 * is opened again when it drops.
 */

type SocketState = 'connecting' | 'open' | 'closed' | 'error';

const STATE_TEXT: Record<SocketState, string> = {
  connecting: 'Opening the console.',
  open: 'Connected to the server console.',
  closed: 'The console connection was closed.',
  error: 'The console could not be opened.',
};

export default function ConsoleTab({ instance }: TabProps) {
  const { push } = useToast();
  const [lines, setLines] = useState<string[]>([]);
  const [state, setState] = useState<SocketState>('connecting');
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // The credentials decide whether the panel can serve the console at all.
  const credentials = useAsync((signal) => getConsole(instance.id, signal), [instance.id]);

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
            setState('open');
            return;
          }
          if (parsed?.event === 'error') {
            setState('error');
            setLines((previous) => [...previous, parsed.message ?? 'The console connection failed.']);
            return;
          }
        } catch {
          // Not a control message, so it is console output.
        }
        setLines((previous) => [...previous.slice(-500), raw]);
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
  }, [instance.id, credentials.error]);

  // The output always shows the newest line.
  useEffect(() => {
    const element = outputRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines]);

  const onSend = async () => {
    const value = command.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await sendCommand(instance.id, value);
      setCommand('');
      push('Command sent.', 'ok');
    } catch (error) {
      push(error instanceof Error ? error.message : 'The command could not be sent.', 'error');
    } finally {
      setSending(false);
    }
  };

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
            <div
              ref={outputRef}
              className="max-h-[420px] min-h-[220px] overflow-y-auto overscroll-contain rounded-2xl bg-con p-4 font-mono text-[13px] leading-relaxed text-con-ink"
              role="log"
              aria-live="polite"
              aria-label="Console output"
            >
              {lines.length === 0 ? (
                <p className="text-con-ink/70">
                  {state === 'open' ? 'Waiting for output.' : 'The console is not connected yet.'}
                </p>
              ) : (
                lines.map((line, index) => (
                  <p key={`${index}-${line.slice(0, 12)}`} className="break-words whitespace-pre-wrap">
                    {line}
                  </p>
                ))
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <TextInput
                  label="Command"
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  placeholder="Send a command to the server"
                  disabled={state !== 'open' || sending}
                  autoComplete="off"
                  spellCheck={false}
                  className="scroll-mt-16 font-mono"
                />
              </div>
              <PrimaryButton onClick={() => void onSend()} disabled={state !== 'open' || sending || !command.trim()}>
                {sending ? 'Sending…' : 'Send'}
              </PrimaryButton>
              {state !== 'open' && (
                <SoftButton onClick={() => setLines([])} disabled={lines.length === 0}>
                  Clear
                </SoftButton>
              )}
            </div>

            <p className="mt-2 text-[12.5px] text-ink3">
              {state === 'open'
                ? 'The console is connected. Commands are sent through the Blipmade API.'
                : 'The console reconnects on its own when the connection drops.'}
            </p>
          </>
        )}
      </Panel>
    </div>
  );
}
