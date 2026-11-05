import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ClientApiError } from '../services/pterodactyl/client.js';
import * as operations from '../services/panel/operations.js';
import * as client from '../services/pterodactyl/client.js';
import { GIT_RUNTIMES } from '../services/git-deploy.js';
import { buildReport, supportBody, type CollectedSource, type DiagnosisFacts, type SourceState } from '../services/diagnosis.js';
import { requireAuth } from '../plugins/auth.js';

/**
 * Reads the evidence a server already has and says what it supports.
 * The console socket only replays the current container. It is not a saved log, so this check does not open it.
 */
export async function registerInstanceHelpRoutes(app: FastifyInstance): Promise<void> {
  async function gather(request: FastifyRequest) {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id, request.method, request.url);
    const row = await prisma.instance.findUnique({
      where: { id: instance.id },
      select: {
        name: true, status: true, ram: true, cpu: true, disk: true,
        provisionError: true, applicationError: true, installationManifest: true,
        runtimeState: true, runtimeStateStale: true,
        product: { select: { slug: true, name: true } },
      },
    });
    const slug = row?.product.slug ?? '';
    const sources: CollectedSource[] = [];
    sources.push({
      id: 'console',
      label: 'Live console',
      state: 'unsupported',
      note: 'The console is a live stream. Connecting to it replays recent output from the current container on the node. That replay is not saved, and this check does not open it.',
    });

    const events = await prisma.instanceEvent.findMany({
      where: { instanceId: instance.id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { type: true, message: true, createdAt: true },
    });
    sources.push({
      id: 'events',
      label: 'Platform events',
      state: events.length ? 'available' : 'missing',
      note: events.length ? `${events.length} recent event(s) on this server.` : 'No event has been recorded for this server.',
      text: events.map((event) => event.message).join('\n'),
    });

    const imported = await prisma.importSource.findFirst({
      where: { instanceId: instance.id },
      orderBy: { createdAt: 'desc' },
      select: { phase: true, lastError: true, kind: true },
    });
    if (imported) {
      sources.push({
        id: 'import',
        label: 'Import',
        state: 'available',
        note: `The ${imported.kind} import is ${imported.phase}.`,
        text: imported.lastError ?? '',
      });
    }

    const manifest = row?.installationManifest as { status?: string } | null;
    if (manifest?.status) {
      sources.push({
        id: 'install',
        label: 'Preset install',
        state: 'available',
        note: `The preset install is ${manifest.status}.`,
      });
    }

    const facts: DiagnosisFacts = {
      provisionError: row?.provisionError ?? null,
      applicationError: row?.applicationError ?? null,
      installStatus: manifest?.status ?? null,
      deployState: null,
      deployMessage: null,
      importPhase: imported?.phase ?? null,
      importError: imported?.lastError ?? null,
    };

    if (slug === 'minecraft-bedrock') {
      sources.push({ id: 'game-log', label: 'Game log', state: 'unsupported', note: 'Bedrock does not write logs/latest.log. The live console is the output that exists, and it is not saved here.' });
    } else if (!slug.startsWith('minecraft-') && !GIT_RUNTIMES.has(slug)) {
      sources.push({ id: 'app-log', label: 'Application log', state: 'unsupported', note: 'This product has no log file the platform knows how to read. The live console is not saved.' });
    }

    const blocked = (state: SourceState, note: string) => {
      sources.push({ id: 'container', label: 'Container', state, note });
      for (const source of plannedFiles(slug)) sources.push({ id: source.id, label: source.label, state, note });
      if (slug.startsWith('minecraft-') && slug !== 'minecraft-bedrock') {
        sources.push({ id: 'crash-report', label: 'Minecraft crash report', state, note });
      }
      if (GIT_RUNTIMES.has(slug)) {
        sources.push({ id: 'deploy-status', label: 'Deployment status', state, note });
        sources.push({ id: 'deploy-log', label: 'Deployment log', state, note });
      }
    };
    if (!instance.pterodactylUuid) {
      blocked('unsupported', 'This server is not on the panel yet, so its files and container cannot be read.');
      return { instance, row, sources, facts, events };
    }

    let token = '';
    try {
      token = await operations.customerToken(instance);
    } catch {
      blocked('inaccessible', 'The panel credential for this account could not be used.');
      return { instance, row, sources, facts, events };
    }

    sources.push(await containerSource(token, instance.pterodactylUuid, row?.ram ?? 0, row?.runtimeState, row?.runtimeStateStale ?? false));
    for (const planned of plannedFiles(slug)) sources.push(await readFileSource(token, instance.pterodactylUuid, planned));
    if (slug.startsWith('minecraft-') && slug !== 'minecraft-bedrock') {
      sources.push(await crashSource(token, instance.pterodactylUuid));
    }
    if (GIT_RUNTIMES.has(slug)) {
      const deploy = await deploySources(token, instance.pterodactylUuid);
      facts.deployState = deploy.state;
      facts.deployMessage = deploy.message;
      sources.push(...deploy.sources);
    }
    return { instance, row, sources, facts, events };
  }

  app.get('/instances/:id/diagnose', async (request: FastifyRequest) => {
    const { row, sources, facts } = await gather(request);
    return buildReport(row?.product.slug ?? '', sources, facts);
  });

  app.get('/instances/:id/support-bundle', async (request: FastifyRequest) => {
    const { instance, row, sources, facts, events } = await gather(request);
    const slug = row?.product.slug ?? '';
    const report = buildReport(slug, sources, facts);
    return {
      subject: `Help with ${row?.name ?? 'my server'}`,
      body: supportBody(
        report,
        { product: row?.product.name ?? 'unknown', slug, name: row?.name ?? '', status: row?.status ?? '', ram: row?.ram ?? 0, cpu: row?.cpu ?? 0, disk: row?.disk ?? 0 },
        events.map((event) => ({ at: event.createdAt.toISOString().slice(0, 16).replace('T', ' '), type: event.type, message: event.message })),
        sources,
      ),
      instanceId: instance.id,
    };
  });
}

function plannedFiles(slug: string): { id: string; label: string; path: string }[] {
  if (slug.startsWith('minecraft-') && slug !== 'minecraft-bedrock') {
    return [{ id: 'latest-log', label: 'Minecraft log', path: '/logs/latest.log' }];
  }
  if (slug === 'minecraft-bedrock') return [];
  return [];
}

function readState(error: unknown): SourceState {
  if (error instanceof ClientApiError) {
    if (error.status === 404) return 'missing';
    if (error.status === 401 || error.status === 403) return 'inaccessible';
  }
  return 'failed';
}

function readNote(error: unknown): string {
  if (error instanceof ClientApiError) return `The panel answered ${error.status}.`;
  return 'The panel could not be reached.';
}

async function readFileSource(token: string, uuid: string, planned: { id: string; label: string; path: string }): Promise<CollectedSource> {
  try {
    const file = await client.readFile(token, uuid, planned.path);
    return { ...planned, state: 'available', note: `Read ${planned.path}.`, text: file.content };
  } catch (error) {
    return { ...planned, state: readState(error), note: readNote(error) };
  }
}

async function crashSource(token: string, uuid: string): Promise<CollectedSource> {
  try {
    const files = await client.listFiles(token, uuid, '/crash-reports');
    const reports = files.filter((file) => file.is_file && file.name.endsWith('.txt')).sort((a, b) => b.modified_at.localeCompare(a.modified_at));
    if (!reports[0]) return { id: 'crash-report', label: 'Minecraft crash report', state: 'missing', note: 'The crash-reports folder has no report.' };
    const name = reports[0].name;
    if (!/^[A-Za-z0-9._-]+\.txt$/.test(name)) return { id: 'crash-report', label: 'Minecraft crash report', state: 'failed', note: 'The newest crash report has a name that cannot be read safely.' };
    const file = await client.readFile(token, uuid, `/crash-reports/${name}`);
    return { id: 'crash-report', label: 'Minecraft crash report', state: 'available', note: `Read ${name}.`, text: file.content };
  } catch (error) {
    return { id: 'crash-report', label: 'Minecraft crash report', state: readState(error), note: readNote(error) };
  }
}

async function containerSource(token: string, uuid: string, planMb: number, recorded: string | null | undefined, stale: boolean): Promise<CollectedSource> {
  try {
    const resources = await client.getResources(token, uuid);
    const used = Math.round(resources.memory_bytes / (1024 * 1024));
    const fresh = stale ? ' The last saved reading was stale.' : '';
    const saved = recorded ? ` The platform last saved "${recorded}".` : '';
    return {
      id: 'container',
      label: 'Container',
      state: 'available',
      note: `The node reports ${resources.state || 'an unknown state'} and ${used} MB in use, of the ${planMb} MB plan. The node does not say whether the kernel stopped the process for memory.${saved}${fresh}`,
    };
  } catch (error) {
    return { id: 'container', label: 'Container', state: readState(error), note: readNote(error) };
  }
}

async function deploySources(token: string, uuid: string): Promise<{ state: string | null; message: string | null; sources: CollectedSource[] }> {
  const sources: CollectedSource[] = [];
  let state: string | null = null;
  let message: string | null = null;
  let id = '';
  try {
    const file = await client.readFile(token, uuid, '/.blipmade/status.json');
    const parsed = JSON.parse(file.content) as { state?: string; message?: string; id?: string };
    state = parsed.state ?? null;
    message = parsed.message ?? null;
    id = parsed.id ?? '';
    sources.push({ id: 'deploy-status', label: 'Deployment status', state: 'available', note: `The last deployment is ${state || 'unrecorded'}.`, text: file.content });
  } catch (error) {
    const missing = error instanceof SyntaxError ? 'failed' as const : readState(error);
    sources.push({
      id: 'deploy-status',
      label: 'Deployment status',
      state: error instanceof SyntaxError ? 'failed' : missing,
      note: error instanceof SyntaxError ? 'The deployment status file is not valid.' : readNote(error),
    });
  }
  if (/^[0-9a-f-]{8,40}$/.test(id)) {
    sources.push(await readFileSource(token, uuid, { id: 'deploy-log', label: 'Deployment log', path: `/.blipmade/logs/${id}.log` }));
  } else if (state) {
    sources.push({ id: 'deploy-log', label: 'Deployment log', state: 'missing', note: 'The deployment did not name a log file.' });
  }
  return { state, message, sources };
}
