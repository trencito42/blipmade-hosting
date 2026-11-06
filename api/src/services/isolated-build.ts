/**
 * Isolated Smart Deploy builds. The API and the worker never execute uploaded archives.
 * A sandbox host (SMART_DEPLOY_SANDBOX) is the only place commands may run.
 */

export interface IsolatedBuildPlan {
  buildCommand: string;
  startCommand: string;
  runtime: string | null;
  executes: false;
  sandboxHost: string | null;
  status: 'planned' | 'blocked_no_sandbox';
  note: string;
}

export function sandboxHost(): string | null {
  const host = (process.env.SMART_DEPLOY_SANDBOX ?? '').trim();
  return host || null;
}

export function planIsolatedBuild(input: { buildCommand: string; startCommand: string; runtime: string | null }): IsolatedBuildPlan {
  const host = sandboxHost();
  if (!host) {
    return {
      buildCommand: input.buildCommand,
      startCommand: input.startCommand,
      runtime: input.runtime,
      executes: false,
      sandboxHost: null,
      status: 'blocked_no_sandbox',
      note: 'Commands are recorded. Nothing runs in the API. Set SMART_DEPLOY_SANDBOX to a disposable builder, then queue the job.',
    };
  }
  return {
    buildCommand: input.buildCommand,
    startCommand: input.startCommand,
    runtime: input.runtime,
    executes: false,
    sandboxHost: host,
    status: 'planned',
    note: 'The sandbox host is the only place that may run these commands. The archive is not executed here.',
  };
}
