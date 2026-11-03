/** A finished panel backup. Completion alone is not enough to switch the server. */
export function backupCompleted(backup: { completedAt: string | null; successful: boolean } | null): boolean {
  return Boolean(backup?.completedAt) && backup?.successful === true;
}

/** The egg changes only after a completed backup whose whole archive verified. */
export function maySwitchProduct(input: { completed: boolean; archiveProblem: string | null }): { ok: true } | { ok: false; reason: string } {
  if (!input.completed) return { ok: false, reason: 'The backup did not finish successfully, so the server was not switched.' };
  if (input.archiveProblem) return { ok: false, reason: input.archiveProblem };
  return { ok: true };
}

export interface RepurposeRollback {
  egg: number;
  image: string;
  startup: string;
  environment: Record<string, string>;
}

/**
 * Changes the egg. If that fails, the backup is restored and the previous egg is put back.
 * A header check is not this. The caller has already verified the archive bytes.
 */
export async function runRepurposeSwitch(input: {
  change: () => Promise<void>;
  restore: () => Promise<void>;
  revert: () => Promise<void>;
}): Promise<{ state: 'switched' | 'restored' | 'restore_failed'; error: string | null }> {
  try {
    await input.change();
    return { state: 'switched', error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The switch failed.';
    let failed = false;
    try {
      await input.restore();
    } catch {
      failed = true;
    }
    try {
      await input.revert();
    } catch {
      failed = true;
    }
    return { state: failed ? 'restore_failed' : 'restored', error: message };
  }
}

/** A switch that stopped after the egg change must be restored. A refused or verified job has not changed the server. */
export function interruptedSwitchNeedsRestore(state: string): boolean {
  return state === 'switching';
}

