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


export interface RepurposeFacts {
  sameProduct: boolean;
  targetSellable: boolean;
  bothInCatalogue: boolean;
  sameFamily: boolean;
  belowMinimum: boolean;
  priceEqual: boolean;
  sameEgg: boolean;
}

export interface RepurposeVerdict {
  eligible: boolean;
  reasons: string[];
  /** A different egg runs an install script on the node. The same egg only changes the variant label. */
  kind: 'same_egg' | 'cross_egg';
  /** A switch never changes the price. A different price card is refused and must be ordered as its own service. */
  billing: 'unchanged' | 'different_price';
}

/** Why a server may or may not move to a target. Pure, so the refusals can be proved without a panel. */
export function repurposeVerdict(facts: RepurposeFacts): RepurposeVerdict {
  const reasons: string[] = [];
  if (facts.sameProduct) reasons.push('The server already runs this product.');
  if (!facts.targetSellable) reasons.push('That product cannot replace this server.');
  if (!facts.bothInCatalogue) reasons.push('Both products have to be in the catalogue before a server can move.');
  else if (!facts.sameFamily) reasons.push('Only variants of the same family can replace each other. Another family is a new order.');
  if (facts.belowMinimum) reasons.push('This server is below the minimum size of that product. Raise the resources first.');
  if (!facts.priceEqual) reasons.push('That variant has a different price. Order it as its own service.');
  return {
    eligible: reasons.length === 0,
    reasons,
    kind: facts.sameEgg ? 'same_egg' : 'cross_egg',
    billing: facts.priceEqual ? 'unchanged' : 'different_price',
  };
}

/** The customer has to name the target on purpose. A bare true is not enough for a step that replaces the program. */
export function repurposeConfirmed(body: { confirm?: unknown; confirmSlug?: unknown }, targetSlug: string): boolean {
  return body.confirm === true && body.confirmSlug === targetSlug;
}
