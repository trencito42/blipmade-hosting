import { useEffect, useState } from 'react';
import { get, put } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ErrorState, LoadingBlock, Panel, PrimaryButton, TextArea, useToast } from '../ui-app';
import { useAction } from '../lib/useAsync';

interface Security {
  require2fa: boolean;
  ipAllowlist: string[];
  yourAddress: string | null;
  staff: { id: string; email: string; role: string; twoFactor: boolean }[];
}

/** Two rules for the staff area: everyone must use two-factor, and only approved addresses may open it. */
export function StaffSecurity({ mayWrite }: { mayWrite: boolean }) {
  const toast = useToast();
  const state = useAsync<Security>((signal) => get<Security>('/admin/security', undefined, signal), []);
  const [require2fa, setRequire2fa] = useState(false);
  const [list, setList] = useState('');
  useEffect(() => {
    if (!state.data) return;
    setRequire2fa(state.data.require2fa);
    setList(state.data.ipAllowlist.join('\n'));
  }, [state.data]);
  const save = useAction(async () => {
    await put('/admin/security', { require2fa, ipAllowlist: list.split(/[\s,]+/).filter(Boolean) });
    toast.push('The rules were saved.', 'ok');
    state.reload();
  });
  if (state.loading && !state.data) return <LoadingBlock rows={2} label="Loading the staff security rules" />;
  if (state.error || !state.data) return <ErrorState title="The staff security rules could not be loaded" message={state.error?.message ?? 'Try again.'} onRetry={state.reload} />;
  const without = state.data.staff.filter((member) => !member.twoFactor);
  return (
    <Panel title="Staff security" description="Two rules for the staff area. Both are off until you turn them on.">
      <div className="grid gap-4">
        <label className="flex items-start gap-3 rounded-2xl bg-s2 p-3.5">
          <input type="checkbox" checked={require2fa} disabled={!mayWrite} onChange={(event) => setRequire2fa(event.target.checked)} className="mt-1 size-4 accent-acc" />
          <span>
            <span className="block text-[14.5px] font-medium text-ink">Require two-factor authentication for the staff</span>
            <span className="block text-[13px] text-ink2">A member of the staff without it is sent to their security settings and cannot open the staff area until they turn it on.</span>
          </span>
        </label>
        {without.length > 0 && (
          <p className="text-[13px] text-ink2">Without two-factor now: {without.map((member) => `${member.email} (${member.role})`).join(', ')}.</p>
        )}
        <div className="grid gap-1.5">
          <TextArea
            label="Allowed addresses"
            hint={`One address or range per line (203.0.113.7 or 203.0.113.0/24). Empty means every address. Your address now: ${state.data.yourAddress ?? 'unknown'}. It must be in the list when you save.`}
            value={list}
            onChange={(event) => setList(event.target.value)}
            rows={4}
            disabled={!mayWrite}
            spellCheck={false}
            error={save.fieldErrors.ipAllowlist}
          />
        </div>
        {save.error && !save.fieldErrors.ipAllowlist && <p role="alert" className="text-[13.5px] font-medium text-bad">{save.error}</p>}
        {mayWrite && <div><PrimaryButton onClick={() => void save.run()} disabled={save.pending}>{save.pending ? 'Saving…' : 'Save the rules'}</PrimaryButton></div>}
      </div>
    </Panel>
  );
}
