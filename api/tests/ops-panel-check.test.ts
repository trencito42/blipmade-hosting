import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The check of the control panel.
 *
 * The panel is replaced with a fake, so the two answers that matter can be
 * produced on demand: a panel that answers, and a panel that refuses the key
 * of the platform. The code of the check is the real one.
 *
 * The reason this check exists is measured: the Application API key of the
 * panel was revoked, the platform could not build a service any more, and
 * nothing said so. A panel that is there and a panel the platform can use are
 * not the same thing, and only the second one matters when an order comes in.
 */

const panel = vi.hoisted(() => ({
  listServers: vi.fn(async () => [] as { id: number }[]),
}));

vi.mock('../src/services/pterodactyl/application.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/pterodactyl/application.js')>();
  return {
    ...actual,
    listServers: panel.listServers,
  };
});

const { PterodactylError } = await import('../src/services/pterodactyl/application.js');
const { runOpsCheck } = await import('../src/services/ops-health.js');

/** A moment in time that does not depend on when the suite runs. */
const NOW = new Date('2026-10-27T08:00:00.000Z');

describe('the check of the control panel', () => {
  beforeEach(() => {
    panel.listServers.mockReset();
    panel.listServers.mockResolvedValue([]);
  });

  it('is quiet when the panel answers', async () => {
    const result = await runOpsCheck('panel', NOW);
    expect(result.state).toBe('ok');
    expect(result.findings).toHaveLength(0);
  });

  it('counts the servers the panel has', async () => {
    panel.listServers.mockResolvedValue([{ id: 1 }, { id: 2 }] as { id: number }[]);
    const result = await runOpsCheck('panel', NOW);
    expect(result.summary).toContain('2 server(s)');
  });

  it('says that the key was refused when the panel does not accept it', async () => {
    panel.listServers.mockRejectedValue(
      new PterodactylError(
        401,
        '',
        'Pterodactyl GET /api/application/servers failed with 401. Unauthenticated.',
      ),
    );
    const result = await runOpsCheck('panel', NOW);
    expect(result.state).toBe('critical');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].fingerprint).toBe('panel:application-key');
    expect(result.findings[0].type).toBe('ops.panel_unreachable');
    expect(result.findings[0].severity).toBe('critical');
    expect(result.summary).toContain('refused');
  });

  it('says that a permission is missing when the key may not read the servers', async () => {
    panel.listServers.mockRejectedValue(
      new PterodactylError(
        403,
        '',
        'Pterodactyl GET /api/application/servers failed with 403. Forbidden.',
      ),
    );
    const result = await runOpsCheck('panel', NOW);
    expect(result.state).toBe('critical');
    // The two answers are fixed in two different places, so the operator is
    // told which one it is.
    expect(result.summary).toContain('permission');
  });

  it('still reports a problem when the panel cannot be reached at all', async () => {
    panel.listServers.mockRejectedValue(new Error('Pterodactyl GET /api/application/servers could not be reached.'));
    const result = await runOpsCheck('panel', NOW);
    expect(result.state).toBe('critical');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].fingerprint).toBe('panel:application-key');
  });
});
