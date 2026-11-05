import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';
import * as operations from '../services/panel/operations.js';
import * as application from '../services/pterodactyl/application.js';
import * as client from '../services/pterodactyl/client.js';
import {
  EDITABLE_PROPERTIES, MINECRAFT_JAVA, applyProperties, cleanRawCommand, commandFor, namesOfList, paperVersions, parseProperties, pingJava,
  pluginFileFor, pluginEntries, pluginToggleName, PLUGIN_FILE, searchPlugins, searchModpacks, modpackFilesFor, type PlayerAction,
} from '../services/minecraft.js';

/**
 * Minecraft tools of an instance: who is online, the whitelist, operators and bans, the commands, server.properties,
 * the version, and plugins. They use the panel's own file and command endpoints with the key of the owner, so a
 * member of a shared server can only do what the owner allowed.
 */
export async function registerMinecraftRoutes(app: FastifyInstance): Promise<void> {
  const write = {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  };

  async function load(request: FastifyRequest) {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id, request.method, request.url);
    const product = await prisma.instance.findUnique({ where: { id: instance.id }, select: { product: { select: { slug: true } } } });
    const slug = product?.product.slug ?? '';
    if (!MINECRAFT_JAVA.has(slug)) throw badRequest('These tools are for Minecraft Java servers (Paper, Folia, Forge).');
    const token = await operations.customerToken(instance);
    return { user, instance, slug, token, uuid: instance.pterodactylUuid as string };
  }

  async function readText(token: string, uuid: string, path: string): Promise<string> {
    try {
      return (await client.readFile(token, uuid, path)).content;
    } catch {
      return '';
    }
  }

  app.get('/instances/:id/minecraft', async (request: FastifyRequest) => {
    const { instance, token, uuid, slug } = await load(request);
    const allocations = await operations.allocations(token, instance);
    const primary = allocations.find((entry) => entry.is_default) ?? allocations[0];
    const [status, props, whitelist, ops, bans] = await Promise.all([
      primary ? pingJava(primary.ip, primary.port) : Promise.resolve({ online: false }),
      readText(token, uuid, '/server.properties'),
      readText(token, uuid, '/whitelist.json'),
      readText(token, uuid, '/ops.json'),
      readText(token, uuid, '/banned-players.json'),
    ]);
    const properties = parseProperties(props);
    const editable = Object.fromEntries(Object.keys(EDITABLE_PROPERTIES).map((key) => [key, properties[key] ?? null]));
    return {
      slug,
      // The address players type. The public host when the platform has one, else the address of the allocation.
      address: primary ? `${env.GAME_PUBLIC_HOST || primary.alias || primary.ip}:${primary.port}` : null,
      status,
      properties: editable,
      whitelist: namesOfList(whitelist),
      ops: namesOfList(ops),
      banned: namesOfList(bans),
    };
  });

  app.post('/instances/:id/minecraft/player', write, async (request: FastifyRequest) => {
    const { user, instance, token, uuid } = await load(request);
    const body = z.object({ action: z.enum(['whitelist-add', 'whitelist-remove', 'op', 'deop', 'kick', 'ban', 'pardon']), player: z.string().max(40), reason: z.string().max(100).optional() }).parse(request.body ?? {});
    const command = commandFor(body.action as PlayerAction, body.player, body.reason);
    try {
      await client.sendCommand(token, uuid, command);
    } catch {
      throw conflict('The server is not running, so it cannot take the command. Start it first.');
    }
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.minecraft_player', targetType: 'instance', targetId: instance.id, meta: { action: body.action, player: body.player } });
    return { sent: true };
  });

  app.post('/instances/:id/minecraft/command', write, async (request: FastifyRequest) => {
    const { user, instance, token, uuid } = await load(request);
    const { command } = z.object({ command: z.string().max(300) }).parse(request.body ?? {});
    const clean = cleanRawCommand(command);
    try {
      await client.sendCommand(token, uuid, clean);
    } catch {
      throw conflict('The server is not running, so it cannot take the command. Start it first.');
    }
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.minecraft_command', targetType: 'instance', targetId: instance.id, meta: { command: clean.slice(0, 80) } });
    return { sent: true };
  });

  app.put('/instances/:id/minecraft/properties', write, async (request: FastifyRequest) => {
    const { user, instance, token, uuid } = await load(request);
    const { changes } = z.object({ changes: z.record(z.string(), z.string().max(300)) }).parse(request.body ?? {});
    const text = await readText(token, uuid, '/server.properties');
    if (!text) throw conflict('server.properties does not exist yet. Start the server once, so it is made.');
    await client.writeFile(token, uuid, '/server.properties', applyProperties(text, changes));
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.minecraft_properties', targetType: 'instance', targetId: instance.id, meta: { keys: Object.keys(changes) } });
    return { saved: true, note: 'The server reads this file when it starts: restart it to apply.' };
  });

  // --- the version (Paper) -----------------------------------------------------------------------------------------
  app.get('/instances/:id/minecraft/versions', async (request: FastifyRequest) => {
    const { instance, slug } = await load(request);
    if (slug !== 'minecraft-paper') return { supported: false, versions: [], current: null };
    const server = await application.getServer(instance.pterodactylServerId as number);
    return { supported: true, versions: (await paperVersions()).slice(0, 25), current: server.container.environment.MINECRAFT_VERSION ?? null };
  });

  app.put('/instances/:id/minecraft/version', write, async (request: FastifyRequest) => {
    const { user, instance, token, uuid, slug } = await load(request);
    if (slug !== 'minecraft-paper') throw badRequest('Version changes are for Paper servers for now.');
    const { version } = z.object({ version: z.string().max(20) }).parse(request.body ?? {});
    if (!(await paperVersions()).includes(version)) throw badRequest('That version does not exist.');
    // A new version can break a world that an older one made. The first thing that happens is a backup, and if it
    // cannot be made nothing else happens.
    try {
      await client.createBackup(token, uuid, { name: `Before version ${version}`.slice(0, 100), locked: true });
    } catch {
      throw conflict('A backup could not be made first, so the version was not changed. Delete an old unlocked backup and try again.');
    }
    const server = await application.getServer(instance.pterodactylServerId as number);
    await application.updateServerStartup(instance.pterodactylServerId as number, {
      environment: { ...server.container.environment, MINECRAFT_VERSION: version, BUILD_NUMBER: 'latest' },
      skip_scripts: true,
    });
    await application.reinstallServer(instance.pterodactylServerId as number);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.minecraft_version', targetType: 'instance', targetId: instance.id, meta: { version } });
    return { started: true, note: 'A backup was made and the new version is being installed. Your world and settings are kept; start the server when the install ends.' };
  });

  // --- plugins -------------------------------------------------------------------------------------------------------
  app.get('/instances/:id/minecraft/plugins', async (request: FastifyRequest) => {
    const { token, uuid } = await load(request);
    try {
      const files = await client.listFiles(token, uuid, '/plugins');
      return { installed: pluginEntries(files) };
    } catch {
      return { installed: [] };
    }
  });

  app.get('/instances/:id/minecraft/plugins/search', async (request: FastifyRequest) => {
    const { instance } = await load(request);
    const { q, version } = z.object({ q: z.string().min(1).max(60), version: z.string().regex(/^\d+\.\d+(\.\d+)?$/) }).parse(request.query);
    void instance;
    return { results: await searchPlugins(q, version) };
  });

  app.post('/instances/:id/minecraft/plugins', write, async (request: FastifyRequest) => {
    const { user, instance, token, uuid } = await load(request);
    const { slug, version } = z.object({ slug: z.string().max(64), version: z.string().regex(/^\d+\.\d+(\.\d+)?$/) }).parse(request.body ?? {});
    const file = await pluginFileFor(slug, version);
    try {
      await client.createFolder(token, uuid, '/plugins');
    } catch {
      // It is there.
    }
    await client.pullFile(token, uuid, file.url, '/plugins', file.filename);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.minecraft_plugin', targetType: 'instance', targetId: instance.id, meta: { plugin: slug, file: file.filename, version: file.version } });
    return { installed: file.filename, note: 'Restart the server to load it.' };
  });

  app.delete('/instances/:id/minecraft/plugins', write, async (request: FastifyRequest) => {
    const { user, instance, token, uuid, slug } = await load(request);
    if (slug !== 'minecraft-paper') throw badRequest('Plugins are removed from Paper servers.');
    const { name } = z.object({ name: z.string().regex(PLUGIN_FILE) }).parse(request.body ?? {});
    try {
      await client.createBackup(token, uuid, { name: `Before removing ${name}`.slice(0, 100), locked: true });
    } catch {
      throw conflict('A backup could not be made first, so the plugin was not removed. Delete an old unlocked backup and try again.');
    }
    await client.deleteFile(token, uuid, `/plugins/${name}`);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.minecraft_plugin_removed', targetType: 'instance', targetId: instance.id, meta: { file: name } });
    return { removed: name, note: 'Restart the server to unload it.' };
  });

  app.put('/instances/:id/minecraft/plugins', write, async (request: FastifyRequest) => {
    const { user, instance, token, uuid, slug } = await load(request);
    if (slug !== 'minecraft-paper') throw badRequest('Plugins are managed on Paper servers.');
    const { name, enabled } = z.object({ name: z.string().regex(PLUGIN_FILE), enabled: z.boolean() }).parse(request.body ?? {});
    const to = pluginToggleName(name, enabled);
    if (to === name) return { name, enabled, note: 'Nothing to change.' };
    await client.renameFile(token, uuid, `/plugins/${name}`, to);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.minecraft_plugin_toggled', targetType: 'instance', targetId: instance.id, meta: { file: name, enabled } });
    return { name: to, enabled, note: 'Restart the server to apply.' };
  });

  app.get('/instances/:id/minecraft/worlds', async (request: FastifyRequest) => {
    const { token, uuid } = await load(request);
    const worlds: { name: string; entries: number }[] = [];
    for (const name of ['world', 'world_nether', 'world_the_end']) {
      try {
        const files = await client.listFiles(token, uuid, `/${name}`);
        worlds.push({ name, entries: files.length });
      } catch { /* The world has not been created yet. */ }
    }
    return { worlds };
  });

  app.get('/instances/:id/minecraft/modpacks/search', async (request: FastifyRequest) => {
    const { slug } = await load(request);
    if (slug !== 'minecraft-forge') throw badRequest('Modpacks install on Forge servers.');
    const { q, version } = z.object({ q: z.string().min(1).max(60), version: z.string().regex(/^\d+\.\d+(\.\d+)?$/) }).parse(request.query);
    return { results: await searchModpacks(q, version) };
  });

  app.post('/instances/:id/minecraft/modpacks', write, async (request: FastifyRequest) => {
    const { user, instance, token, uuid, slug } = await load(request);
    if (slug !== 'minecraft-forge') throw badRequest('Modpacks install on Forge servers.');
    const body = z.object({ slug: z.string().max(64), version: z.string().regex(/^\d+\.\d+(\.\d+)?$/) }).parse(request.body ?? {});
    const pack = await modpackFilesFor(body.slug, body.version);
    try {
      await client.createBackup(token, uuid, { name: `Before modpack ${pack.title}`.slice(0, 100), locked: true });
    } catch {
      throw conflict('A backup could not be made first, so the modpack was not installed. Delete an old unlocked backup and try again.');
    }
    for (const file of pack.files) {
      const folder = file.directory;
      try { await client.createFolder(token, uuid, folder); } catch { /* The folder is already there. */ }
      await client.pullFile(token, uuid, file.url, folder, file.filename);
    }
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.minecraft_modpack', targetType: 'instance', targetId: instance.id, meta: { modpack: body.slug, files: pack.files.length } });
    return { installed: pack.files.length, note: 'A backup was made and the mods were downloaded. Restart the server to load them.' };
  });
}
