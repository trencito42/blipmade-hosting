import { get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { Panel, SoftButton, StatusPill, useToast } from '../../ui-app';

interface ConnectInfo {
  enabled: boolean;
  supported: boolean;
  profile: { id: string; label: string; supportedClients: string; limitations: string[]; experimental: boolean } | null;
  state: 'PENDING_DNS' | 'DNS_VERIFIED' | 'CLIENT_VERIFIED' | 'DEGRADED' | 'UNSUPPORTED' | null;
  address: string | null;
  fallback: string | null;
  note: string | null;
}

const STATE_LABEL: Record<string, { tone: string; label: string }> = {
  PENDING_DNS: { tone: 'pending', label: 'Waiting for DNS' },
  DNS_VERIFIED: { tone: 'available', label: 'DNS ready' },
  CLIENT_VERIFIED: { tone: 'available', label: 'Joined with a client' },
  DEGRADED: { tone: 'failed', label: 'DNS needs attention' },
};

/**
 * The clean address of a game server. It is shown once the DNS answers with it, and the address with the port stays one
 * click away. DNS that answers is not a game that joined, and the card says so. Nothing is shown where the feature is off
 * or the game has no clean address.
 */
export function Connect({ instance, canCheck }: { instance: { id: string }; canCheck: boolean }) {
  const toast = useToast();
  const base = `/instances/${encodeURIComponent(instance.id)}/connect`;
  const state = useAsync<ConnectInfo>((signal) => get(base, undefined, signal), [instance.id]);
  const check = useAction(async () => {
    await post(`${base}/sync`, {});
    state.reload();
  });
  const copy = (value: string, what: string) =>
    void navigator.clipboard.writeText(value).then(
      () => toast.push(`${what} copied.`, 'ok'),
      () => toast.push('Copy failed. Select the text and copy it by hand.', 'error'),
    );
  const info = state.data;
  if (!info || !info.enabled || !info.supported || !info.profile) return null;
  const shown = info.state ? STATE_LABEL[info.state] : undefined;
  return (
    <Panel title="Connect" description={`The address to give your players for ${info.profile.label}.`}>
      <div className="grid gap-3">
        {info.address ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 break-all rounded-xl bg-s2 px-3 py-2 font-mono text-[14px] text-ink" data-testid="connect-address">{info.address}</code>
            <SoftButton type="button" onClick={() => copy(info.address!, 'The address')}>Copy</SoftButton>
            {shown && <StatusPill status={shown.tone} label={shown.label} />}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink2">
            {shown && <StatusPill status={shown.tone} label={shown.label} />}
            <span>The clean address is on its way. Until it answers, use the address and the port below.</span>
          </div>
        )}
        {info.state === 'DNS_VERIFIED' && <p className="text-[13px] text-ink3">The DNS answers with this name. That is not the same as a player joining: if the name does not work in the game, use the address and the port.</p>}
        {info.note && info.state !== 'DNS_VERIFIED' && <p className="text-[13px] text-ink3">{info.note}</p>}
        {info.profile.experimental && <p className="text-[13px] text-ink3">Experimental: no player was seen joining with this name yet.</p>}
        <details className="rounded-2xl bg-s2 px-3 py-2 text-[13.5px] text-ink2">
          <summary className="cursor-pointer font-semibold text-ink">Address and port, and what reads the name</summary>
          <div className="mt-2 grid gap-2">
            {info.fallback ? (
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all font-mono text-ink" data-testid="connect-fallback">{info.fallback}</code>
                <SoftButton type="button" onClick={() => copy(info.fallback!, 'The address and the port')}>Copy</SoftButton>
              </div>
            ) : <p>The address and the port appear once the server has them.</p>}
            <p>{info.profile.supportedClients}</p>
            {info.profile.limitations.map((line) => <p key={line}>{line}</p>)}
          </div>
        </details>
        {canCheck && <div><SoftButton type="button" onClick={() => void check.run()} disabled={check.pending}>{check.pending ? 'Checking…' : 'Check the DNS again'}</SoftButton></div>}
        {check.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{check.error}</p>}
      </div>
    </Panel>
  );
}
