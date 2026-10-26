import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, notFound, unavailable } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import * as client from '../services/pterodactyl/client.js';
import * as pteroApp from '../services/pterodactyl/application.js';
import * as operations from '../services/panel/operations.js';
import { reinstallInstance } from '../services/reinstall.js';
import { assertBoundedFields, MAX_ENVIRONMENT_VARIABLES, MAX_PAYLOAD_KEYS } from '../lib/bounded.js';

/**
 * Every route of this file reaches the panel or the node, so every one
 * of them carries the limit of the panel.
 *
 * A file that is written, a database that is created, a backup that is
 * restored and a server that is reinstalled all spend the memory and
 * the disk of the node that every customer shares. The limit is
 * counted for the account of the customer and for the address of the
 * caller, so neither one customer nor one address can exhaust the node
 * for everybody.
 */

/**
 * The operations a customer can run on their own server.
 *
 * Every route here goes through `services/panel/operations.ts`, which loads the
 * instance for the customer that asks for it. An instance of somebody else
 * answers 404, exactly like an instance that does not exist, so an identifier
 * cannot be probed.
 *
 * The credential that is used is the client key of the customer, scoped to
 * their own panel account. The panel checks the ownership of the server again
 * on its side, so even a mistake here cannot expose a server of somebody else.
 * The key never reaches the browser.
 *
 * Destructive operations are guarded: a file that is deleted, a database that
 * is dropped, a backup that is removed and the reinstall of a server all leave
 * a trace in the event list and in the audit log.
 */

const idParam = z.object({ id: z.string() });

/** The path of a file inside the server. */
const filePath = z.string().min(1).max(1024);

/** The format of an archive. */

/**
 * Runs a panel operation for the instance of the customer that asks for it.
 *
 * The instance is loaded first, so a request for the server of somebody else
 * never reaches the panel. The token of the customer is resolved afterwards.
 */
async function withInstance<T>(
  request: FastifyRequest,
  run: (token: string, instance: operations.OwnedInstance) => Promise<T>,
): Promise<T> {
  const user = await requireAuth(request);
  const { id } = idParam.parse(request.params);
  const instance = await operations.loadOwnedInstance(user.id, id);
  const token = await operations.customerToken(instance);
  return run(token, instance);
}

/**
 * Turns a panel answer into an answer of this API.
 *
 * A server that the panel does not show to this customer answers 404 there,
 * and it answers 404 here: the customer has no such server.
 */
function translatePanelError(error: unknown): never {
  if (error instanceof client.ClientApiError) {
    if (error.status === 404) throw notFound('That resource does not exist on this server.');
    if (error.status === 401 || error.status === 403) {
      throw unavailable('The panel refused this operation for this server.');
    }
  }
  throw error;
}

/** Writes a note in the event list of the instance. */
async function note(instanceId: string, type: string, message: string): Promise<void> {
  await prisma.instanceEvent.create({ data: { instanceId, type, message } });
}

export async function registerInstanceServerRoutes(app: FastifyInstance): Promise<void> {
  // --- state ---------------------------------------------------------------

  /** The state of the server as the panel sees it. */
  app.get('/instances/:id/server', async (request: FastifyRequest) => {
    return withInstance(request, async (token, instance) => {
      try {
        const server = await operations.serverInfo(token, instance);
        return {
          server: {
            uuid: server.uuid,
            identifier: server.identifier,
            name: server.server_name,
            state: server.state,
            isSuspended: server.is_suspended,
            limits: server.limits,
            features: server.features,
            createdAt: server.created_at,
          },
        };
      } catch (error) {
        return translatePanelError(error);
      }
    });
  });

  /**
   * The live usage of the server.
   *
   * The counters are the ones of the panel, so a screen can show what it does
   * not know as "not known" instead of a zero.
   */
  app.get('/instances/:id/resources', async (request: FastifyRequest) => {
    return withInstance(request, async (token, instance) => {
      try {
        const resources = await operations.resources(token, instance);
        return {
          resources: {
            state: resources.state,
            is_suspended: resources.is_suspended,
            cpu_absolute: resources.cpu_absolute,
            memory_bytes: resources.memory_bytes,
            network: { rx: resources.network.rx, tx: resources.network.tx },
            disk: { used: resources.disk.used },
            uptime: resources.uptime,
          },
        };
      } catch (error) {
        return translatePanelError(error);
      }
    });
  });

  /** The activity of the server, as the panel records it. */
  app.get('/instances/:id/activity', async (request: FastifyRequest) => {
    return withInstance(request, async (token, instance) => {
      try {
        const entries = await operations.activity(token, instance);
        return {
          activity: entries.map((entry) => ({
            user: entry.user,
            action: entry.action,
            meta: entry.meta,
            createdAt: entry.created_at,
          })),
        };
      } catch (error) {
        return translatePanelError(error);
      }
    });
  });

  // --- files ---------------------------------------------------------------

  app.get('/instances/:id/files', async (request: FastifyRequest) => {
    const query = z.object({ path: z.string().max(1024).optional() }).parse(request.query ?? {});
    return withInstance(request, async (token, instance) => {
      try {
        const files = await operations.listFiles(token, instance, query.path ?? '/');
        // The panel shape is kept next to the normalised one, so a screen can
        // use the fields it knows without having to know the names of the
        // panel.
        const entries = files.map((file) => ({
          name: file.name,
          isDirectory: file.is_directory,
          isFile: file.is_file,
          isSymlink: file.is_symlink,
          size: file.size,
          modifiedAt: file.modified_at,
          createdAt: file.created_at,
          mode: file.mode,
        }));
        return { files, entries, path: query.path ?? '/' };
      } catch (error) {
        return translatePanelError(error);
      }
    });
  });

  app.get('/instances/:id/file', async (request: FastifyRequest) => {
    const query = z.object({ path: filePath }).parse(request.query);
    return withInstance(request, async (token, instance) => {
      try {
        const file = await operations.readFile(token, instance, query.path);
        return { content: file.content, encoding: file.encoding };
      } catch (error) {
        return translatePanelError(error);
      }
    });
  });

  app.put('/instances/:id/file', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    const body = z
      .object({ path: filePath, content: z.string().max(5_000_000) })
      .parse(request.body);
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);
    try {
      await operations.writeFile(token, instance, body.path, body.content);
    } catch (error) {
      return translatePanelError(error);
    }
    await note(instance.id, 'files', `Saved ${body.path}.`);
    return reply.code(204).send();
  });

  app.delete('/instances/:id/file', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    const query = z.object({ path: filePath }).parse(request.query ?? {});
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);
    try {
      await operations.deleteFile(token, instance, query.path);
    } catch (error) {
      return translatePanelError(error);
    }
    await note(instance.id, 'files', `Deleted ${query.path}.`);
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'instance.file_deleted',
      targetType: 'instance',
      targetId: instance.id,
      meta: { path: query.path },
    });
    return reply.code(204).send();
  });

  /** Renames a file or a folder inside the same folder. */
  app.post('/instances/:id/files/rename', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const body = z.object({ path: filePath, to: filePath }).parse(request.body);
    return withInstance(request, async (token, instance) => {
      try {
        await operations.renameFile(token, instance, body.path, body.to);
      } catch (error) {
        return translatePanelError(error);
      }
      await note(instance.id, 'files', `Renamed ${body.path} to ${body.to}.`);
      return { renamed: true };
    });
  });

  /** Moves a file or a folder to another folder. */
  app.post('/instances/:id/files/move', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const body = z.object({ path: filePath, to: filePath }).parse(request.body);
    return withInstance(request, async (token, instance) => {
      try {
        await operations.moveFile(token, instance, body.path, body.to);
      } catch (error) {
        return translatePanelError(error);
      }
      await note(instance.id, 'files', `Moved ${body.path} to ${body.to}.`);
      return { moved: true };
    });
  });

  /** Copies a file or a folder to another folder. */
  app.post('/instances/:id/files/copy', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const body = z.object({ path: filePath, to: filePath }).parse(request.body);
    return withInstance(request, async (token, instance) => {
      try {
        await operations.copyFile(token, instance, body.path, body.to);
      } catch (error) {
        return translatePanelError(error);
      }
      await note(instance.id, 'files', `Copied ${body.path} to ${body.to}.`);
      return { copied: true };
    });
  });

  /**
   * Uploads a file.
   *
   * Two shapes are accepted. A text file is sent as a JSON object, and a
   * binary file is sent as it is with the name and the folder in the query.
   * Either way the content reaches the node without being changed.
   */
  app.post(
    '/instances/:id/files/upload',
    {
      bodyLimit: 64 * 1024 * 1024,
      config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
      preHandler: customerLimit(app, LIMITS.panel),
    },
    async (request: FastifyRequest, reply) => {
      const user = await requireAuth(request);
      const { id } = idParam.parse(request.params);
      const instance = await operations.loadOwnedInstance(user.id, id);
      const token = await operations.customerToken(instance);

      const contentType = String(request.headers['content-type'] ?? '');
      let directory: string;
      let filename: string;
      let content: Buffer;

      if (contentType.includes('application/json')) {
        const body = z
          .object({
            path: z.string().min(1).max(1024).default('/'),
            name: z.string().min(1).max(255),
            content: z.string().max(20_000_000),
          })
          .parse(request.body ?? {});
        directory = body.path;
        filename = body.name;
        content = Buffer.from(body.content, 'utf-8');
      } else {
        const query = z
          .object({ directory: z.string().min(1).max(1024).default('/'), filename: z.string().min(1).max(255) })
          .parse(request.query ?? {});
        directory = query.directory;
        filename = query.filename;
        const raw = request.body as Buffer | undefined;
        if (!raw || !raw.length) throw badRequest('The file is empty.');
        content = raw;
      }

      try {
        await operations.uploadFile(token, instance, directory, filename, content);
      } catch (error) {
        return translatePanelError(error);
      }
      await note(instance.id, 'files', `Uploaded ${filename}.`);
      return reply.code(204).send();
    },
  );

  /** Downloads a file as it is. */
  app.get('/instances/:id/files/download', async (request: FastifyRequest, reply) => {
    const query = z.object({ path: filePath }).parse(request.query);
    return withInstance(request, async (token, instance) => {
      try {
        const content = await operations.downloadFile(token, instance, query.path);
        return reply
          .header('Content-Type', 'application/octet-stream')
          .header(
            'Content-Disposition',
            `attachment; filename="${encodeURIComponent(query.path.split('/').pop() ?? 'download')}"`,
          )
          .send(content);
      } catch (error) {
        return translatePanelError(error);
      }
    });
  });

  /**
   * Compresses files into an archive.
   *
   * The node decides the format and the name of the archive, so the answer
   * carries the name of the archive that was made.
   */
  const compress = async (request: FastifyRequest) => {
    const body = z.object({ paths: z.array(filePath).min(1).max(50) }).parse(request.body);
    return withInstance(request, async (token, instance) => {
      let archive: string;
      try {
        archive = await operations.compressFiles(token, instance, body.paths);
      } catch (error) {
        return translatePanelError(error);
      }
      await note(instance.id, 'files', `Created an archive of ${body.paths.length} item(s).`);
      return { compressed: true, archive };
    });
  };

  app.post('/instances/:id/files/compress', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, compress);
  app.post('/instances/:id/files/archive', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, compress);

  /**
   * Unpacks an archive.
   *
   * The node reads the format out of the archive itself, so the request does
   * not name one.
   */
  const decompress = async (request: FastifyRequest) => {
    const body = z.object({ path: filePath }).parse(request.body);
    return withInstance(request, async (token, instance) => {
      try {
        await operations.decompressArchive(token, instance, body.path);
      } catch (error) {
        return translatePanelError(error);
      }
      await note(instance.id, 'files', `Unpacked ${body.path}.`);
      return { decompressed: true };
    });
  };

  app.post('/instances/:id/files/decompress', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, decompress);
  app.post('/instances/:id/files/unarchive', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, decompress);

  /** Changes the permissions of a file or a folder. */
  app.post('/instances/:id/files/chmod', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const body = z.object({ path: filePath, mode: z.number().int().min(0).max(0o7777) }).parse(request.body);
    return withInstance(request, async (token, instance) => {
      try {
        await operations.chmodFile(token, instance, body.path, body.mode);
      } catch (error) {
        return translatePanelError(error);
      }
      await note(instance.id, 'files', `Changed the permissions of ${body.path}.`);
      return { chmodded: true };
    });
  });

  // --- databases -----------------------------------------------------------

  app.get('/instances/:id/databases', async (request: FastifyRequest) => {
    return withInstance(request, async (token, instance) => {
      try {
        const databases = await operations.databases(token, instance);
        return {
          databases: databases.map((database) => ({
            id: database.id,
            name: database.name,
            username: database.username,
            host: database.host,
            port: database.port,
            database: database.name,
            remote: database.remote,
            password: database.password,
          })),
        };
      } catch (error) {
        return translatePanelError(error);
      }
    });
  });

  app.post('/instances/:id/databases', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    const body = z
      .object({
        database: z.string().trim().min(1).max(64),
        username: z.string().trim().min(1).max(64),
        password: z.string().min(1).max(128),
        remote: z.string().trim().min(1).max(128),
      })
      .parse(request.body);
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);
    try {
      await operations.createDatabase(token, instance, body);
    } catch (error) {
      return translatePanelError(error);
    }
    await note(instance.id, 'databases', `Created the database ${body.database}.`);
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'instance.database_created',
      targetType: 'instance',
      targetId: instance.id,
      meta: { database: body.database },
    });
    return reply.code(201).send({ created: true });
  });

  /**
   * Changes the password of a database.
   *
   * The panel offers one change for a database: a new password. A request for
   * anything else is refused with the reason, so the customer is never told
   * that something was changed when it was not.
   */
  app.patch('/instances/:id/databases/:databaseId', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const params = z.object({ id: z.string(), databaseId: z.string().min(1).max(64) }).parse(request.params);
    const body = z.object({ password: z.string().min(1).max(128).optional() }).parse(request.body ?? {});
    if (!body.password) {
      throw badRequest('A database can only be changed by giving it a new password.');
    }
    return withInstance(request, async (token, instance) => {
      try {
        await operations.updateDatabase(token, instance, params.databaseId, body);
      } catch (error) {
        return translatePanelError(error);
      }
      await note(instance.id, 'databases', `Changed the password of the database ${params.databaseId}.`);
      return { updated: true };
    });
  });

  app.delete('/instances/:id/databases/:databaseId', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    const params = z.object({ id: z.string(), databaseId: z.string().min(1).max(64) }).parse(request.params);
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);
    try {
      await operations.deleteDatabase(token, instance, params.databaseId);
    } catch (error) {
      return translatePanelError(error);
    }
    await note(instance.id, 'databases', `Deleted the database ${params.databaseId}.`);
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'instance.database_deleted',
      targetType: 'instance',
      targetId: instance.id,
      meta: { databaseId: params.databaseId },
    });
    return reply.code(204).send();
  });

  /**
   * The credentials of a database. The answer holds the password, so the call
   * is written to the audit log.
   */
  app.get('/instances/:id/databases/:databaseId/credentials', async (request: FastifyRequest) => {
    const params = z.object({ id: z.string(), databaseId: z.string().min(1).max(64) }).parse(request.params);
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);
    try {
      const database = await operations.databaseCredentials(token, instance, params.databaseId);
      await audit({
        actorId: user.id,
        actorEmail: user.email,
        action: 'instance.database_credentials_read',
        targetType: 'instance',
        targetId: instance.id,
        meta: { databaseId: params.databaseId },
      });
      return {
        credentials: {
          username: database.username,
          password: database.password ?? '',
          host: database.host,
          port: database.port,
          database: database.name,
        },
      };
    } catch (error) {
      return translatePanelError(error);
    }
  });

  // --- backups -------------------------------------------------------------

  app.get('/instances/:id/backups', async (request: FastifyRequest) => {
    return withInstance(request, async (token, instance) => {
      try {
        const backups = await operations.backups(token, instance);
        return {
          backups: backups.map((backup) => ({
            id: backup.uuid,
            name: backup.name,
            size: backup.size,
            created_at: backup.created_at,
            is_locked: backup.is_locked,
          })),
        };
      } catch (error) {
        return translatePanelError(error);
      }
    });
  });

  app.post('/instances/:id/backups', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(100),
        locked: z.boolean().default(false),
      })
      .parse(request.body ?? {});
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);
    try {
      const backup = await operations.createBackup(token, instance, body);
      await note(instance.id, 'backups', `Created the backup ${body.name}.`);
      await audit({
        actorId: user.id,
        actorEmail: user.email,
        action: 'instance.backup_created',
        targetType: 'instance',
        targetId: instance.id,
        meta: { name: body.name },
      });
      return reply.code(201).send({ backup: { id: backup.uuid, name: backup.name } });
    } catch (error) {
      return translatePanelError(error);
    }
  });

  app.get('/instances/:id/backups/:backupId/download', async (request: FastifyRequest, reply) => {
    const params = z.object({ id: z.string(), backupId: z.string().min(1).max(100) }).parse(request.params);
    return withInstance(request, async (token, instance) => {
      try {
        const content = await operations.downloadBackup(token, instance, params.backupId);
        return reply
          .header('Content-Type', 'application/octet-stream')
          .header('Content-Disposition', `attachment; filename="${params.backupId}.tar.gz"`)
          .send(content);
      } catch (error) {
        return translatePanelError(error);
      }
    });
  });

  /** Restores a backup. The files of the server are replaced by the archive. */
  app.post('/instances/:id/backups/:backupId/restore', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const params = z.object({ id: z.string(), backupId: z.string().min(1).max(100) }).parse(request.params);
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);
    try {
      await operations.restoreBackup(token, instance, params.backupId);
    } catch (error) {
      return translatePanelError(error);
    }
    await note(instance.id, 'backups', `Restored the backup ${params.backupId}.`);
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'instance.backup_restored',
      targetType: 'instance',
      targetId: instance.id,
      meta: { backupId: params.backupId },
    });
    return { restored: true };
  });

  app.delete('/instances/:id/backups/:backupId', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    const params = z.object({ id: z.string(), backupId: z.string().min(1).max(100) }).parse(request.params);
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);
    try {
      await operations.deleteBackup(token, instance, params.backupId);
    } catch (error) {
      return translatePanelError(error);
    }
    await note(instance.id, 'backups', `Deleted the backup ${params.backupId}.`);
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'instance.backup_deleted',
      targetType: 'instance',
      targetId: instance.id,
      meta: { backupId: params.backupId },
    });
    return reply.code(204).send();
  });

  // --- network -------------------------------------------------------------

  app.get('/instances/:id/allocations', async (request: FastifyRequest) => {
    return withInstance(request, async (token, instance) => {
      try {
        const allocations = await operations.allocations(token, instance);
        return {
          allocations: allocations.map((allocation) => ({
            id: allocation.id,
            ip: allocation.ip,
            port: allocation.port,
            alias: allocation.alias,
            is_default: allocation.is_default,
          })),
        };
      } catch (error) {
        return translatePanelError(error);
      }
    });
  });

  /**
   * Adds an address to the server.
   *
   * The panel picks the address itself out of the free ones of the node, so
   * the customer does not choose an address and a port.
   */
  app.post('/instances/:id/allocations', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);
    try {
      await operations.createAllocation(token, instance);
    } catch (error) {
      return translatePanelError(error);
    }
    await note(instance.id, 'network', 'Added an address to the server.');
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'instance.allocation_created',
      targetType: 'instance',
      targetId: instance.id,
    });
    return reply.code(201).send({ created: true });
  });

  /** Makes an address the primary one of the server. */
  app.put('/instances/:id/allocations', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const body = z.object({ primary: z.coerce.number().int().positive() }).parse(request.body ?? {});
    return withInstance(request, async (token, instance) => {
      try {
        await operations.setPrimaryAllocation(token, instance, body.primary);
      } catch (error) {
        return translatePanelError(error);
      }
      await note(instance.id, 'network', `The address ${body.primary} is now the primary one.`);
      return { updated: true };
    });
  });

  app.patch('/instances/:id/allocations/:allocationId', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const params = z.object({ id: z.string(), allocationId: z.coerce.number().int().positive() }).parse(request.params);
    const body = z
      .object({ isDefault: z.boolean().optional(), alias: z.string().trim().max(64).nullable().optional() })
      .parse(request.body ?? {});
    return withInstance(request, async (token, instance) => {
      try {
        if (body.isDefault) {
          await operations.setPrimaryAllocation(token, instance, params.allocationId);
        } else if (body.alias !== undefined) {
          await operations.updateAllocation(token, instance, params.allocationId, body.alias ?? '');
        } else {
          throw badRequest('An address can only be renamed or made the primary one.');
        }
      } catch (error) {
        return translatePanelError(error);
      }
      await note(instance.id, 'network', `Updated the address ${params.allocationId}.`);
      return { updated: true };
    });
  });

  app.delete('/instances/:id/allocations/:allocationId', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    const params = z.object({ id: z.string(), allocationId: z.coerce.number().int().positive() }).parse(request.params);
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);
    try {
      await operations.deleteAllocation(token, instance, params.allocationId);
    } catch (error) {
      return translatePanelError(error);
    }
    await note(instance.id, 'network', `Removed the address ${params.allocationId}.`);
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'instance.allocation_deleted',
      targetType: 'instance',
      targetId: instance.id,
      meta: { allocationId: params.allocationId },
    });
    return reply.code(204).send();
  });

  // --- startup -------------------------------------------------------------

  /**
   * The image, the startup command and the environment of the server.
   *
   * These three are read from the administrative API of the panel: the client
   * API of the panel cannot change them, and the instance is checked for the
   * ownership before the panel is asked. The administrative key never leaves
   * this server.
   */
  app.get('/instances/:id/startup', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    if (!instance.pterodactylServerId) throw notFound('This instance is not deployed yet.');

    const server = await pteroApp.getServer(instance.pterodactylServerId);
    const environment: Record<string, string> = {};
    for (const [key, value] of Object.entries(server.container.environment ?? {})) {
      environment[key] = String(value ?? '');
    }
    return {
      image: server.container.image,
      command: server.container.startup_command,
      environment,
    };
  });

  /**
   * Changes the image, the startup command and the environment of the server.
   *
   * The environment is sent as a whole, because the panel replaces it. The
   * values that are not mentioned are taken from the current ones.
   */
  const changeStartup = async (request: FastifyRequest) => {
    // The environment is counted before the body is read, so a body with too
    // many variables is refused without the cost of walking them.
    assertBoundedFields(request.body, {
      environment: { max: MAX_ENVIRONMENT_VARIABLES, label: 'The environment' },
    });
    const body = z
      .object({
        image: z.string().trim().min(1).max(255).optional(),
        command: z.string().max(4096).optional(),
        startup: z.string().max(4096).optional(),
        environment: z.record(z.string().max(4096)).optional(),
      })
      .parse(request.body ?? {});
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    if (!instance.pterodactylServerId) throw notFound('This instance is not deployed yet.');

    const server = await pteroApp.getServer(instance.pterodactylServerId);
    const current: Record<string, string> = {};
    for (const [key, value] of Object.entries(server.container.environment ?? {})) {
      current[key] = String(value ?? '');
    }
    const environment = { ...current, ...(body.environment ?? {}) };
    const command = body.command ?? body.startup;

    await pteroApp.updateServerStartup(instance.pterodactylServerId, {
      image: body.image,
      startup: command,
      environment,
    });

    await note(instance.id, 'startup', 'The startup configuration was updated.');
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'instance.startup_updated',
      targetType: 'instance',
      targetId: instance.id,
    });
    return {
      image: body.image ?? server.container.image,
      command: command ?? server.container.startup_command,
      environment,
    };
  };

  app.put('/instances/:id/startup', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, changeStartup);
  app.patch('/instances/:id/startup', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, changeStartup);

  // --- schedules -----------------------------------------------------------

  app.get('/instances/:id/schedules', async (request: FastifyRequest) => {
    return withInstance(request, async (token, instance) => {
      try {
        const schedules = await operations.schedules(token, instance);
        return {
          schedules: schedules.map((schedule) => ({
            id: schedule.id,
            name: schedule.name,
            cron: schedule.cron,
            action: schedule.action,
            active: schedule.active,
            payload: schedule.payload,
            last_run: schedule.last_run,
            next_run: schedule.next_run,
          })),
        };
      } catch (error) {
        return translatePanelError(error);
      }
    });
  });

  app.post('/instances/:id/schedules', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    // The payload is counted before the body is read, so a body with too many
    // keys is refused without the cost of walking them.
    assertBoundedFields(request.body, {
      payload: { max: MAX_PAYLOAD_KEYS, label: 'The payload' },
    });
    const body = z
      .object({
        name: z.string().trim().min(1).max(100),
        cron: z.string().trim().min(1).max(100),
        action: z.enum(['power', 'command', 'backup']),
        active: z.boolean().default(true),
        payload: z.record(z.unknown()).default({}),
      })
      .parse(request.body);
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);
    try {
      await operations.createSchedule(token, instance, body);
    } catch (error) {
      return translatePanelError(error);
    }
    await note(instance.id, 'schedules', `Created the schedule ${body.name}.`);
    return reply.code(201).send({ created: true });
  });

  app.patch('/instances/:id/schedules/:scheduleId', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const params = z.object({ id: z.string(), scheduleId: z.coerce.number().int().positive() }).parse(request.params);
    // The payload is counted before the body is read, so a body with too many
    // keys is refused without the cost of walking them.
    assertBoundedFields(request.body, {
      payload: { max: MAX_PAYLOAD_KEYS, label: 'The payload' },
    });
    const body = z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        cron: z.string().trim().min(1).max(100).optional(),
        active: z.boolean().optional(),
        payload: z.record(z.unknown()).optional(),
      })
      .parse(request.body ?? {});
    return withInstance(request, async (token, instance) => {
      try {
        await operations.updateSchedule(token, instance, params.scheduleId, body);
      } catch (error) {
        return translatePanelError(error);
      }
      await note(instance.id, 'schedules', `Updated the schedule ${params.scheduleId}.`);
      return { updated: true };
    });
  });

  app.delete('/instances/:id/schedules/:scheduleId', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    const params = z.object({ id: z.string(), scheduleId: z.coerce.number().int().positive() }).parse(request.params);
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);
    try {
      await operations.deleteSchedule(token, instance, params.scheduleId);
    } catch (error) {
      return translatePanelError(error);
    }
    await note(instance.id, 'schedules', `Deleted the schedule ${params.scheduleId}.`);
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'instance.schedule_deleted',
      targetType: 'instance',
      targetId: instance.id,
      meta: { scheduleId: params.scheduleId },
    });
    return reply.code(204).send();
  });

  /** Runs a schedule right away. */
  app.post('/instances/:id/schedules/:scheduleId/run', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const params = z.object({ id: z.string(), scheduleId: z.coerce.number().int().positive() }).parse(request.params);
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);
    try {
      await operations.runSchedule(token, instance, params.scheduleId);
    } catch (error) {
      return translatePanelError(error);
    }
    await note(instance.id, 'schedules', `Ran the schedule ${params.scheduleId}.`);
    return { ran: true };
  });

  // --- settings ------------------------------------------------------------

  /**
   * The settings of the server: the name, the description and what the panel
   * says about the container.
   *
   * These are read with the administrative API of the panel, so the settings
   * of a server are visible even when the client key of the customer is not
   * available yet. The administrative key never leaves this server.
   */
  app.get('/instances/:id/settings', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    if (!instance.pterodactylServerId) throw notFound('This instance is not deployed yet.');

    const server = await pteroApp.getServer(instance.pterodactylServerId);
    return {
      name: server.name,
      description: server.description ?? null,
      suspended: instance.status === 'SUSPENDED',
      can_reinstall: true,
      egg: server.egg ?? null,
      docker_image: server.container.image ?? null,
      limits: server.limits,
    };
  });

  /**
   * Changes the name and the description of the server.
   *
   * The name is changed in Blipmade and on the panel, so both places show the
   * same thing.
   */
  app.patch('/instances/:id/settings', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const body = z
      .object({ name: z.string().trim().min(1).max(80).optional(), description: z.string().trim().max(200).optional() })
      .parse(request.body ?? {});
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    if (!instance.pterodactylServerId) throw notFound('This instance is not deployed yet.');

    const server = await pteroApp.getServer(instance.pterodactylServerId);
    await pteroApp.updateServerDetails(instance.pterodactylServerId, {
      name: body.name ?? server.name,
      description: body.description ?? server.description ?? '',
    });
    if (body.name) {
      await prisma.instance.update({ where: { id: instance.id }, data: { name: body.name } });
    }
    await note(instance.id, 'settings', 'The settings of the server were updated.');
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'instance.settings_updated',
      targetType: 'instance',
      targetId: instance.id,
    });
    return {
      name: body.name ?? server.name,
      description: body.description ?? server.description ?? null,
      suspended: instance.status === 'SUSPENDED',
      can_reinstall: true,
      egg: server.egg ?? null,
      docker_image: server.container.image ?? null,
    };
  });

  /**
   * Suspends the instance.
   *
   * The container is stopped with the client key of the customer, so the
   * server really goes down. The instance is marked as suspended in Blipmade
   * as well, so it does not show as running.
   */
  app.post('/instances/:id/suspend', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest) => {
    const body = z.object({ suspended: z.boolean() }).parse(request.body ?? {});
    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    const token = await operations.customerToken(instance);

    try {
      await operations.power(token, instance, body.suspended ? 'stop' : 'start');
    } catch (error) {
      return translatePanelError(error);
    }

    await prisma.instance.update({
      where: { id: instance.id },
      data: {
        suspendedAt: body.suspended ? new Date() : null,
        status: body.suspended ? 'SUSPENDED' : 'ONLINE',
      },
    });
    await note(instance.id, 'settings', body.suspended ? 'The instance was suspended.' : 'The instance was restored.');
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: body.suspended ? 'instance.suspended' : 'instance.reinstated',
      targetType: 'instance',
      targetId: instance.id,
    });
    return { suspended: body.suspended };
  });

  /**
   * Reinstalls the server. Everything the customer stored in the container is
   * lost, so the route says so out loud and writes a trace of it.
   *
   * The reinstall is not only the request to the panel: the platform brings
   * the container back. The application is put in it again, it is started and
   * the platform waits for it to serve, so the customer does not find a
   * service that is dark because the panel left the container stopped.
   */
  app.post('/instances/:id/settings/reinstall', {
    config: { rateLimit: { max: LIMITS.panel.address, timeWindow: LIMITS.panel.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  }, async (request: FastifyRequest, reply) => {
    const body = z.object({ confirm: z.literal(true) }).parse(request.body ?? {});
    if (body.confirm !== true) throw badRequest('The reinstall has to be confirmed.');

    const user = await requireAuth(request);
    const { id } = idParam.parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id);
    let outcome;
    try {
      outcome = await reinstallInstance(instance.id, { requestedBy: user.id });
    } catch (error) {
      return translatePanelError(error);
    }
    await note(
      instance.id,
      'settings',
      'The server was reinstalled. The files of the container were erased and the service is being rebuilt.',
    );
    await audit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'instance.reinstalled',
      targetType: 'instance',
      targetId: instance.id,
      meta: { asked: outcome.asked },
    });
    return reply.code(202).send({ reinstalled: true, status: 'reinstalling' });
  });
}
