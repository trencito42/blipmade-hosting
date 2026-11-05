/**
 * The label the customer sees.
 * A fresh reading of the container wins over the platform status, including when that status still says stopped or online.
 * A stale reading does not replace the platform status.
 */
export function customerStatusOf(instance: {
  status: string;
  runtimeCondition: string | null;
  runtimeStateStale?: boolean;
}): string {
  const platform = instance.status.toLowerCase();
  const watched = instance.status === 'ONLINE' || instance.status === 'RESTARTING' || instance.status === 'DEGRADED' || instance.status === 'STOPPED';
  if (!watched || instance.runtimeStateStale) return platform;
  if (instance.runtimeCondition === 'serving') return 'online';
  if (instance.runtimeCondition === 'starting') return 'starting';
  if (instance.runtimeCondition === 'stopped') return 'stopped';
  return platform;
}
