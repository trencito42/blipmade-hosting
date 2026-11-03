import { useMemo, useState } from 'react';
import { get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../components/premium';
import { fmtDateTime } from './common';

interface GitState {
  supported: boolean;
  configured: boolean;
  branch?: string;
  autoDeploy?: boolean;
  status?: { state: string };
  releases?: string[];
  current?: string | null;
}

interface Deployment {
  id: string;
  state: string;
  action: string;
  by: string;
  release: string;
  commit: string;
  message: string;
  at: string;
}

/** The review before a Git deployment is replaced by an earlier release of the same instance. */
export default function RollbackDeployment() {
  const { id = '', deployId = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const base = `/instances/${encodeURIComponent(id)}/git`;
  const state = useAsync<GitState>((signal) => get<GitState>(base, undefined, signal), [id]);
  const history = useAsync<{ deployments: Deployment[] }>((signal) => get(`${base}/deployments`, undefined, signal), [id]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [touched, setTouched] = useState(false);
  const backTo = `${base.replace('/instances/', '/app/instances/')}`;
  useUnsavedChangesGuard(acknowledged, 'Discard this rollback confirmation?');

  const entry = useMemo(() => history.data?.deployments.find((row) => row.id === deployId), [history.data, deployId]);
  const git = state.data;
  const building = git?.status?.state === 'building' || Boolean(history.data?.deployments.some((row) => row.state === 'started'));
  // Same rule as the deployment list: only a finished release that is still on disk and is not the one that runs.
  const eligible = Boolean(
    entry && entry.state === 'succeeded' && entry.release && entry.release !== git?.current && (git?.releases ?? []).includes(entry.release),
  );
  const rollback = useAction(async () => post(`${base}/rollback`, { release: entry?.release }));

  const submit = async () => {
    setTouched(true);
    if (!entry || !eligible || !acknowledged || building) return;
    const result = await rollback.run();
    if (!result) return;
    toast.push('The rollback was queued.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!acknowledged || window.confirm('Discard this rollback confirmation?')) navigate(backTo);
  };

  const loading = state.loading || history.loading;
  const error = state.error ?? history.error;

  return (
    <PageEditorShell
      eyebrow="Git deployment"
      title="Go back to an earlier release"
      description="Review which release replaces the running one and confirm. The rollback is queued and runs asynchronously."
      backTo={backTo}
      backLabel="Back to Git"
      dirty={acknowledged}
      aside={
        entry ? (
          <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
            <h2 className="text-[16px] font-semibold text-ink">Target release</h2>
            <dl className="mt-4 grid gap-3 text-[13px]">
              <div>
                <dt className="text-ink3">Commit</dt>
                <dd className="mt-0.5 break-all font-mono text-ink">{entry.commit || 'Not recorded'}</dd>
              </div>
              <div>
                <dt className="text-ink3">Deployed</dt>
                <dd className="mt-0.5 font-mono text-ink">{fmtDateTime(entry.at)}</dd>
              </div>
              <div>
                <dt className="text-ink3">By</dt>
                <dd className="mt-0.5 break-all text-ink">{entry.by || 'Unknown'}</dd>
              </div>
            </dl>
          </aside>
        ) : undefined
      }
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={rollback.pending}>Discard</SoftButton>
          <PrimaryButton
            type="button"
            onClick={() => void submit()}
            disabled={rollback.pending || loading || !eligible || building || !acknowledged}
          >
            {rollback.pending ? 'Queuing…' : 'Go back to this release'}
          </PrimaryButton>
        </>
      }
    >
      {loading ? (
        <LoadingBlock rows={3} label="Loading the deployment" />
      ) : error ? (
        <ErrorState title="Could not load the deployment" message={error.message} onRetry={() => { state.reload(); history.reload(); }} />
      ) : !entry ? (
        <ErrorState title="Deployment not found" message="It is not in the history of this instance." />
      ) : !eligible ? (
        <ErrorState
          title="This release cannot be restored"
          message="Only a finished deployment that is still stored and is not the running release can be restored."
        />
      ) : (
        <div className="grid gap-5">
          <div role="alert" className="rounded-2xl border border-bad/25 bg-bad/10 p-4">
            <h2 className="text-[14px] font-semibold text-bad">The running release is replaced</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink2">
              The application restarts on the earlier release. Environment variables and data are not rolled back.
              {git?.autoDeploy ? ` Automatic deployment is on, so a new push to ${git.branch ?? 'the branch'} deploys over this rollback.` : ''}
            </p>
          </div>
          {building && (
            <p role="alert" className="rounded-2xl bg-s2 p-4 text-[13.5px] text-ink2">
              A deployment is running. Wait for it to finish before going back.
            </p>
          )}
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-3.5 text-[13.5px] text-ink2">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 size-5 accent-[var(--color-acc)]"
            />
            <span>
              <strong className="block text-ink">I understand the running release is replaced</strong>
              The instance restarts on commit {entry.commit || 'this release'}.
            </span>
          </label>
          {touched && !acknowledged && (
            <p role="alert" className="text-[13px] font-medium text-bad">Acknowledge the replacement before going back.</p>
          )}
          {rollback.error && <p role="alert" className="rounded-2xl bg-bad/10 p-4 text-[13.5px] font-medium text-bad">{rollback.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}
