/** A deployment the worker has finished with. An open `started` row is not one of these. */
const DEPLOY_DONE = new Set(['succeeded', 'failed', 'interrupted']);

export interface DeploymentView {
  id: string;
  state: string;
  action: string;
  by: string;
  release: string;
  commit: string;
  message: string;
  at: Date;
  startedAt: Date | null;
}

/** How long a deployment may stay open before a missing job means it was interrupted. */
export const DEPLOY_STALE_MS = 35 * 60 * 1000;

/**
 * Turns deploy events into one row per deployment.
 * A `started` row is "starting" only while its job is the current one, or it is still inside the build window.
 * An older `started` row whose job is gone is interrupted. Nothing here starts that deployment again.
 */
export function deploymentsFromEvents(
  events: { message: string; createdAt: Date }[],
  options: { now: number; activeDeployId: string | null | 'unknown'; staleMs: number },
): DeploymentView[] {
  const byId = new Map<string, DeploymentView>();
  for (const event of [...events].reverse()) {
    const [, id, state, ...rest] = event.message.split(':');
    if (!id || !state) continue;
    const entry = byId.get(id) ?? { id, state: 'started', action: 'build', by: '', release: '', commit: '', message: '', at: event.createdAt, startedAt: null };
    if (state === 'started') {
      entry.action = rest[0] ?? 'build';
      entry.by = rest.slice(1).join(':');
      entry.startedAt = event.createdAt;
    } else {
      entry.state = state;
      entry.release = rest[0] ?? '';
      entry.commit = rest[1] ?? '';
      entry.message = rest.slice(2).join(':');
      entry.at = event.createdAt;
    }
    byId.set(id, entry);
  }
  for (const entry of byId.values()) {
    if (DEPLOY_DONE.has(entry.state)) continue;
    if (options.activeDeployId === 'unknown' || entry.id === options.activeDeployId) {
      if (entry.state === 'started') entry.state = 'starting';
      continue;
    }
    const began = entry.startedAt ?? entry.at;
    if (options.now - began.getTime() >= options.staleMs) {
      entry.state = 'interrupted';
      entry.message = entry.message || 'The worker stopped before this deployment finished. The release already in place was left as it was.';
    } else if (entry.state === 'started') {
      entry.state = 'starting';
    }
  }
  return [...byId.values()].sort((a, b) => b.at.getTime() - a.at.getTime());
}
