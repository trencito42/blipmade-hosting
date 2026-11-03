import { del, get } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { ButtonLink, ErrorState, LoadingBlock, Panel, SoftButton, useToast } from '../../ui-app';
import type { TabProps } from './common';

interface Access {
  members: { id: string; role: 'viewer' | 'manager'; email: string | null; name: string | null; since: string }[];
  invites: { id: string; role: 'viewer' | 'manager'; expiresAt: string }[];
}

const day = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const roleLabel = (role: string) => (role === 'manager' ? 'Manager' : 'Viewer');

/**
 * Who else can open this server.
 *
 * The owner makes a code with a role and gives it to the other person, who redeems it from their own account.
 * A viewer reads (console output, files, activity). A manager also runs the server. Billing, renaming and
 * cancelling stay with the owner.
 */
export default function AccessTab({ instance }: TabProps) {
  const { push } = useToast();
  const base = `/instances/${encodeURIComponent(instance.id)}/access`;
  const state = useAsync<Access>((signal) => get<Access>(base, undefined, signal), [instance.id]);
  const remove = useAction(async (id: string) => {
    await del(`${base}/${encodeURIComponent(id)}`);
    push('The access was removed.', 'ok');
    state.reload();
  });

  return (
    <Panel title="Access" description="Let someone else open this server from their own Blipmade account. A viewer can look; a manager can also run the server. Billing, renaming and cancelling stay with you." action={<ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/access/invite`}>Invite someone</ButtonLink>}>
      <div className="grid gap-4">
        {state.loading && !state.data ? (
          <LoadingBlock rows={1} label="Loading who has access" />
        ) : state.error ? (
          <ErrorState title="The access list could not be loaded" message={state.error.message} onRetry={state.reload} />
        ) : (
          <ul className="grid">
            {(state.data?.members ?? []).map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold text-ink">{member.email ?? member.name} <span className="ml-1 rounded-full bg-s3 px-2 py-0.5 text-[11px] font-bold uppercase text-ink2">{roleLabel(member.role)}</span></p>
                  <p className="text-[12.5px] text-ink3">Since {day(member.since)}</p>
                </div>
                <SoftButton onClick={() => void remove.run(member.id)} disabled={remove.pending}>Remove</SoftButton>
              </li>
            ))}
            {(state.data?.invites ?? []).map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold text-ink">Waiting for a code to be used <span className="ml-1 rounded-full bg-s3 px-2 py-0.5 text-[11px] font-bold uppercase text-ink2">{roleLabel(invite.role)}</span></p>
                  <p className="text-[12.5px] text-ink3">Expires {day(invite.expiresAt)}</p>
                </div>
                <SoftButton onClick={() => void remove.run(invite.id)} disabled={remove.pending}>Cancel</SoftButton>
              </li>
            ))}
            {(state.data?.members.length ?? 0) + (state.data?.invites.length ?? 0) === 0 && <li className="text-[14px] text-ink2">Nobody else has access yet.</li>}
          </ul>
        )}
      </div>
    </Panel>
  );
}
