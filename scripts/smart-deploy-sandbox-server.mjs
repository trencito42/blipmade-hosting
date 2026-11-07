#!/usr/bin/env node
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const runner = resolve(process.env.SMART_DEPLOY_RUNNER || join(scriptDir, 'smart-deploy-sandbox-runner.sh'));
const unpacker = resolve(process.env.SMART_DEPLOY_UNPACKER || join(scriptDir, 'smart-deploy-safe-unpack.py'));
const stateRoot = resolve(process.env.SMART_DEPLOY_STATE_DIR || join(tmpdir(), 'blipmade-sandbox-server'));
const secret = process.env.SMART_DEPLOY_SANDBOX_SECRET || '';
const port = Number(process.env.PORT || 3210);
const maxRequestBytes = 12 * 1024 * 1024;
const maxArtifactBytes = 32 * 1024 * 1024;
let activeBuilds = 0;
const activeJobs = new Map();

if (secret.length < 32) throw new Error('SMART_DEPLOY_SANDBOX_SECRET must contain at least 32 characters.');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid.');
await mkdir(stateRoot, { recursive: true, mode: 0o700 });

function json(response, code, body) {
  const encoded = Buffer.from(JSON.stringify(body));
  response.writeHead(code, { 'content-type': 'application/json', 'content-length': encoded.length, 'cache-control': 'no-store' });
  response.end(encoded);
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyRequest(request, jobId, raw) {
  const timestamp = request.headers['x-blipmade-timestamp'];
  const signature = request.headers['x-blipmade-signature'];
  if (typeof timestamp !== 'string' || typeof signature !== 'string') return false;
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 5 * 60_000) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${jobId}.`).update(raw).digest('hex');
  return safeEqual(signature, `sha256=${expected}`);
}

async function bodyOf(request) {
  const declared = Number(request.headers['content-length'] || '0');
  if (declared > maxRequestBytes) throw new Error('request_too_large');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxRequestBytes) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    const collect = (target, chunk) => {
      outputBytes += chunk.length;
      if (outputBytes <= 1024 * 1024) target.push(chunk);
    };
    child.stdout.on('data', (chunk) => collect(stdout, chunk));
    child.stderr.on('data', (chunk) => collect(stderr, chunk));
    child.on('error', rejectRun);
    child.on('close', (code, signal) => resolveRun({ code: code ?? 1, signal, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }));
  });
}

async function execute(jobId, raw) {
  const body = JSON.parse(raw.toString('utf8'));
  if (!body || typeof body !== 'object') throw new Error('invalid_payload');
  const runtime = typeof body.runtime === 'string' ? body.runtime : '';
  const buildCommand = typeof body.buildCommand === 'string' ? body.buildCommand : '';
  const archiveBase64 = typeof body.archiveBase64 === 'string' ? body.archiveBase64 : '';
  const claimedHash = typeof body.archiveSha256 === 'string' ? body.archiveSha256 : '';
  if (!runtime || !buildCommand || !archiveBase64 || !/^[a-f0-9]{64}$/.test(claimedHash)) throw new Error('invalid_payload');
  if (buildCommand.length > 500) throw new Error('build_command_too_long');
  const archive = Buffer.from(archiveBase64, 'base64');
  if (archive.length === 0 || archive.length > 8 * 1024 * 1024) throw new Error('archive_size_invalid');
  const actualHash = createHash('sha256').update(archive).digest('hex');
  if (!safeEqual(actualHash, claimedHash)) throw new Error('archive_checksum_mismatch');

  const jobRoot = await mkdtemp(join(stateRoot, `${jobId}.`));
  const sourceDir = join(jobRoot, 'source');
  const outputDir = join(jobRoot, 'output');
  const archivePath = join(jobRoot, 'source.archive');
  try {
    await mkdir(sourceDir, { mode: 0o700 });
    await mkdir(outputDir, { mode: 0o700 });
    await writeFile(archivePath, archive, { mode: 0o600 });
    const unpacked = await run('/usr/bin/python3', [unpacker, archivePath, sourceDir]);
    if (unpacked.code !== 0) throw new Error(`archive_rejected: ${unpacked.stderr.trim() || unpacked.stdout.trim()}`);
    const unitName = `blipmade-build-${jobId}`;
    activeJobs.set(jobId, unitName);
    const built = await run(runner, [
      '--source', sourceDir,
      '--output', outputDir,
      '--runtime', runtime,
      '--build', buildCommand,
      '--timeout', '600',
      '--memory-mb', '1024',
      '--disk-mb', '2048',
      '--unit', unitName,
    ]).finally(() => activeJobs.delete(jobId));
    const log = await readFile(join(outputDir, 'build.log'), 'utf8').catch(() => `${built.stdout}\n${built.stderr}`.trim());
    if (built.code !== 0) return { status: 'failed', error: built.stderr.trim() || `Sandbox exited with code ${built.code}.`, log: log.slice(0, 1024 * 1024) };
    const artifact = await readFile(join(outputDir, 'artifact.tar.gz'));
    if (artifact.length === 0 || artifact.length > maxArtifactBytes) throw new Error('artifact_size_invalid');
    return {
      status: 'succeeded',
      log: log.slice(0, 1024 * 1024),
      artifactSha256: createHash('sha256').update(artifact).digest('hex'),
      artifactBytesLength: artifact.length,
      artifactBase64: artifact.toString('base64'),
    };
  } finally {
    if (jobRoot.startsWith(`${stateRoot}/`)) await rm(jobRoot, { recursive: true, force: true });
  }
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') return json(response, 200, { ok: true, isolation: 'user+mount+pid+network+ipc+uts namespaces' });
  const match = request.method === 'POST' || request.method === 'DELETE'
    ? /^\/builds\/([A-Za-z0-9_-]{1,80})$/.exec(request.url || '')
    : null;
  if (!match) return json(response, 404, { error: 'not_found' });
  const jobId = match[1];
  try {
    const raw = await bodyOf(request);
    if (!verifyRequest(request, jobId, raw)) return json(response, 401, { error: 'invalid_signature' });
    if (request.method === 'DELETE') {
      const unitName = activeJobs.get(jobId);
      if (unitName) await run('/usr/bin/systemctl', ['--user', 'stop', `${unitName}.service`]);
      return json(response, 202, { status: unitName ? 'cancelling' : 'not_running' });
    }
    if (activeBuilds >= 2) return json(response, 429, { status: 'failed', error: 'sandbox_capacity_reached', log: '' });
    activeBuilds += 1;
    const result = await execute(jobId, raw).finally(() => { activeBuilds -= 1; });
    return json(response, result.status === 'succeeded' ? 200 : 422, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sandbox_error';
    return json(response, message === 'request_too_large' ? 413 : 422, { status: 'failed', error: message, log: '' });
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 100;

server.listen(port, '127.0.0.1', () => {
  console.log(`smart deploy sandbox listening on 127.0.0.1:${port}`);
});
