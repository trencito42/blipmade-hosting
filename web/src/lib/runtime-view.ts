export type ObservedPower = 'running' | 'starting' | 'stopping' | 'stopped' | 'unknown';

/** What the screen may show from one reading of the node. A missing reading is unknown, not zero. */
export function presentUsage(input: {
  state?: string | null;
  memoryBytes?: number | null;
  cpuPercent?: number | null;
  diskBytes?: number | null;
  readable: boolean;
}): { power: ObservedPower; memoryBytes: number | null; cpuPercent: number | null; diskBytes: number | null } {
  if (!input.readable) return { power: 'unknown', memoryBytes: null, cpuPercent: null, diskBytes: null };
  const state = (input.state ?? '').toLowerCase();
  const disk = input.diskBytes ?? null;
  if (state === 'offline' || state === 'stopped' || state === 'stopping') {
    return { power: state === 'stopping' ? 'stopping' : 'stopped', memoryBytes: null, cpuPercent: null, diskBytes: disk };
  }
  if (state === 'starting') return { power: 'starting', memoryBytes: input.memoryBytes ?? null, cpuPercent: input.cpuPercent ?? null, diskBytes: disk };
  if (state === 'running') return { power: 'running', memoryBytes: input.memoryBytes ?? null, cpuPercent: input.cpuPercent ?? null, diskBytes: disk };
  return { power: 'unknown', memoryBytes: null, cpuPercent: null, diskBytes: disk };
}

export const POWER_LABEL: Record<ObservedPower, string> = {
  running: 'Running',
  starting: 'Starting',
  stopping: 'Stopping',
  stopped: 'Stopped',
  unknown: 'Unknown',
};
