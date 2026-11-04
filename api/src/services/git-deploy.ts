import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';
import { badRequest } from '../lib/errors.js';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';
import * as application from './pterodactyl/application.js';
import * as client from './pterodactyl/client.js';
import * as operations from './panel/operations.js';

/**
 * Git deployment: the code of a public repository is fetched, built and started INSIDE the instance's own container.
 *
 * Nothing runs on the control plane. The platform writes a small managed script and a few small files into the
 * container, makes the script the startup command of the server (the old command is kept, so it can be given back),
 * and restarts it. The script clones the repository, runs the build command under a time limit, keeps the last
 * releases, and starts the app. Because it is the container, the memory, CPU and disk limits of the customer's plan
 * are the limits of the build, and no other customer can see it.
 */

/** Only runtimes where the customer brings the code, and where the container has git and a shell. */
export const GIT_RUNTIMES = new Set(['nodejs', 'discord-bot', 'python', 'php']);

/** Public hosts only. A repository on another host is not fetched: it could be an address inside our own network. */
const GIT_HOSTS = new Set(['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org']);

export const BUILD_TIMEOUT_SECONDS = 900;
export const KEEP_RELEASES = 3;
export const BLIPMADE_DIR = '/.blipmade';

export interface GitConfigInput {
  repoUrl: string;
  branch: string;
  buildCommand: string;
  startCommand: string;
}

/** Checks a repository address. Returns the clean https address, or throws with the reason. */
export function cleanRepoUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw badRequest('Enter the address of a repository, like https://github.com/you/app.', { repoUrl: 'Not an address.' });
  }
  if (url.protocol !== 'https:') throw badRequest('Only https addresses are accepted.', { repoUrl: 'Use https.' });
  if (url.username || url.password) throw badRequest('Do not put a password or a token in the address. Only public repositories are supported.', { repoUrl: 'No credentials in the address.' });
  if (url.port) throw badRequest('Leave the port out.', { repoUrl: 'No port.' });
  if (!GIT_HOSTS.has(url.hostname.toLowerCase())) {
    throw badRequest(`Only ${[...GIT_HOSTS].join(', ')} are supported for now.`, { repoUrl: 'This host is not supported.' });
  }
  const path = url.pathname.replace(/\.git$/, '').replace(/\/+$/, '');
  if (!/^\/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+$/.test(path) || path.includes('..')) {
    throw badRequest('The address must name the owner and the repository.', { repoUrl: 'Use https://host/owner/repository.' });
  }
  return `https://${url.hostname.toLowerCase()}${path}`;
}

export function cleanBranch(raw: string): string {
  const branch = raw.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(branch) || branch.includes('..') || branch.endsWith('/') || branch.endsWith('.lock')) {
    throw badRequest('That is not a branch name.', { branch: 'Use letters, numbers, dots, dashes and slashes.' });
  }
  return branch;
}

/** A command the customer runs in their own container: one line, no control characters. */
export function cleanCommand(raw: string, field: string, required: boolean): string {
  const command = raw.trim();
  if (!command && required) throw badRequest('Enter a command.', { [field]: 'Required.' });
  if (command.length > 500 || /[\u0000-\u001f]/.test(command)) {
    throw badRequest('A command is one line of at most 500 characters.', { [field]: 'One line, up to 500 characters.' });
  }
  return command;
}

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
/** Names the platform owns: an app that sets them would break its own container. */
const RESERVED_ENV = new Set(['SERVER_PORT', 'SERVER_IP', 'P_SERVER_UUID', 'STARTUP', 'HOME', 'PATH', 'USER', 'TZ']);

export function cleanEnv(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!ENV_KEY.test(key)) throw badRequest(`"${key}" is not a valid variable name.`, { env: 'Use letters, numbers and underscores.' });
    if (RESERVED_ENV.has(key)) throw badRequest(`${key} is set by the platform.`, { env: `${key} is reserved.` });
    if (value.length > 2000 || /[\u0000\r\n]/.test(value)) throw badRequest(`The value of ${key} must be one line of at most 2000 characters.`, { env: 'One line per value.' });
    out[key] = value;
  }
  if (Object.keys(out).length > 60) throw badRequest('At most 60 variables.', { env: 'Too many.' });
  return out;
}

/** A value in single quotes, safe for a shell, with any quote inside it escaped. */
export function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function renderConf(config: GitConfigInput, archive = false): string {
  return [
    `REPO=${shq(config.repoUrl)}`,
    `BRANCH=${shq(config.branch)}`,
    `BUILD_CMD=${shq(config.buildCommand)}`,
    `START_CMD=${shq(config.startCommand)}`,
    `BUILD_TIMEOUT=${BUILD_TIMEOUT_SECONDS}`,
    `KEEP=${KEEP_RELEASES}`,
    `ARCHIVE=${archive ? 1 : 0}`,
    '',
  ].join('\n');
}

export function renderEnv(values: Record<string, string>): string {
  return Object.entries(values).map(([key, value]) => `${key}=${shq(value)}`).join('\n') + '\n';
}

export function parseEnvKeys(text: string): string[] {
  return text.split('\n').map((line) => line.split('=')[0]!.trim()).filter((key) => ENV_KEY.test(key));
}

/** Reads the values of an env file that renderEnv wrote. Only used to keep a value the customer did not change. */
export function parseEnvValues(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)='(.*)'$/.exec(line);
    if (match) out[match[1]!] = match[2]!.replace(/'\\''/g, "'");
  }
  return out;
}

/**
 * Applies a Git settings env patch. Returns null when the client did not send env changes (empty object must not wipe secrets).
 */
export function mergeGitEnvUpdate(
  existing: Record<string, string>,
  patch: Record<string, string | null> | undefined,
): Record<string, string> | null {
  if (patch === undefined || Object.keys(patch).length === 0) return null;
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      if (key in existing) merged[key] = existing[key]!;
    } else {
      merged[key] = value;
    }
  }
  return cleanEnv(merged);
}

/** What the container runs as its startup command while Git deployment is on. */
export const GIT_STARTUP = 'bash /home/container/.blipmade/run.sh';

/**
 * The script that runs in the container. It is the same for every instance and it reads its settings from
 * `deploy.conf`; a request to build or to roll back arrives as a one line file, `request`.
 */
export const RUN_SCRIPT = `#!/bin/bash
# Managed by Blipmade: this file is rewritten on every deploy. Your settings are in deploy.conf and app.env.
cd /home/container || exit 1
B=/home/container/.blipmade
mkdir -p "\${B:?}/releases" "\${B:?}/logs"
# shellcheck disable=SC1091
. "$B/deploy.conf"

status() { # status <state> <id> <release> <commit> <message>
  printf '{"state":"%s","id":"%s","release":"%s","commit":"%s","at":"%s","message":"%s"}\\n' "$1" "$2" "$3" "$4" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$5" > "$B/status.json"
}

build() {
  if [ "\${ARCHIVE:-0}" = "1" ]; then
    local src="$B/inbox"
    [ -d "$src" ] || { echo "[blipmade] the archive was not unpacked"; return 11; }
    local one="" count=0
    for item in "$src"/*; do
      [ -e "$item" ] || continue
      [ "$(basename "$item")" = "project.zip" ] && continue
      count=$((count + 1)); one="$item"
    done
    [ "$count" -eq 1 ] && [ -d "$one" ] && src="$one"
    COMMIT="a1c00000"
    REL="$(date -u +%Y%m%d%H%M%S)-$COMMIT"
    mkdir -p "$B/releases/$REL"
    cp -a "$src"/. "$B/releases/$REL/" || return 12
    cd "$B/releases/$REL" || return 12
    set -a; [ -f "$B/app.env" ] && . "$B/app.env"; set +a
    if [ -n "$BUILD_CMD" ]; then
      echo "[blipmade] building: $BUILD_CMD"
      timeout "$BUILD_TIMEOUT" bash -c "$BUILD_CMD" || { echo "[blipmade] the build failed or took longer than $BUILD_TIMEOUT seconds"; return 13; }
    fi
    return 0
  fi
  local tmp="$B/tmp"
  echo "[blipmade] cloning $REPO ($BRANCH)"
  rm -rf "\${tmp:?}"
  timeout 300 git clone --depth 1 --branch "$BRANCH" -- "$REPO" "$tmp" || { echo "[blipmade] the clone failed or took longer than 5 minutes"; return 11; }
  COMMIT="$(git -C "$tmp" rev-parse --short=8 HEAD)"
  REL="$(date -u +%Y%m%d%H%M%S)-$COMMIT"
  rm -rf "\${tmp:?}/.git"
  mv "$tmp" "$B/releases/$REL"
  cd "$B/releases/$REL" || return 12
  set -a; [ -f "$B/app.env" ] && . "$B/app.env"; set +a
  if [ -n "$BUILD_CMD" ]; then
    echo "[blipmade] building: $BUILD_CMD"
    timeout "$BUILD_TIMEOUT" bash -c "$BUILD_CMD" || { echo "[blipmade] the build failed or took longer than $BUILD_TIMEOUT seconds"; return 13; }
  fi
  return 0
}

prune() {
  cd "$B/releases" || return 0
  # shellcheck disable=SC2012
  ls -1t | tail -n +$((KEEP + 1)) | while read -r old; do
    [ "$B/releases/$old" = "$(readlink -f "$B/current" 2>/dev/null)" ] && continue
    rm -rf "\${B:?}/releases/\${old:?}"
  done
  cd "$B/logs" && ls -1t | tail -n +21 | while read -r oldlog; do rm -f "\${B:?}/logs/\${oldlog:?}"; done
}

if [ -f "$B/request" ]; then
  read -r ACTION ID ARG < "$B/request"
  rm -f "$B/request"
  LOG="$B/logs/$ID.log"
  case "$ACTION" in
    archive|build)
      status building "$ID" "" "" "building"
      COMMIT=""; REL=""
      build > "$LOG" 2>&1; rc=$?
      if [ "$rc" -eq 0 ]; then
        ln -sfn "$B/releases/$REL" "$B/current.new" && mv -T "$B/current.new" "$B/current"
        status built "$ID" "$REL" "$COMMIT" "release built, starting application"
        prune
      else
        [ -n "$REL" ] && rm -rf "\${B:?}/releases/\${REL:?}"
        status failed "$ID" "" "$COMMIT" "failed with code $rc, see the log"
      fi
      ;;
    rollback)
      if [[ "$ARG" =~ ^[0-9]{14}-[0-9a-f]{8}$ ]] && [ -d "$B/releases/$ARG" ]; then
        ln -sfn "$B/releases/$ARG" "$B/current.new" && mv -T "$B/current.new" "$B/current"
        echo "[blipmade] rolled back to $ARG" > "$LOG"
        status succeeded "$ID" "$ARG" "\${ARG##*-}" "rolled back"
      else
        echo "[blipmade] that release does not exist" > "$LOG"
        status failed "$ID" "" "" "that release does not exist"
      fi
      ;;
  esac
fi

if [ ! -e "$B/current" ]; then
  echo "[blipmade] nothing is deployed yet. Start a deploy from the panel."
  sleep 2; exit 1
fi
cd "$B/current" || exit 1
set -a; [ -f "$B/app.env" ] && . "$B/app.env"; set +a
echo "[blipmade] starting: $START_CMD"
exec bash -c "$START_CMD"
`;

/** The signature GitHub sends with a webhook, checked in constant time. */
export function verifyGithubSignature(secret: string, body: string | Buffer, header: string | undefined): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const given = header.slice(7);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newWebhookSecret(): { plain: string; sealed: string } {
  const plain = randomBytes(24).toString('hex');
  return { plain, sealed: encryptSecret(plain) };
}

export function openWebhookSecret(sealed: string | null): string | null {
  return sealed ? decryptSecret(sealed) : null;
}

type Instance = operations.OwnedInstance;

/** Writes the managed script, the settings and the variables into the container, and takes over the startup. */
export async function installGit(
  instance: Instance,
  config: GitConfigInput,
  env: Record<string, string> | null,
): Promise<{ previousStartup: string | null }> {
  const token = await operations.customerToken(instance);
  const uuid = instance.pterodactylUuid as string;
  try {
    await client.createFolder(token, uuid, BLIPMADE_DIR);
  } catch {
    // It exists already.
  }
  await client.writeFile(token, uuid, `${BLIPMADE_DIR}/run.sh`, RUN_SCRIPT);
  await client.writeFile(token, uuid, `${BLIPMADE_DIR}/deploy.conf`, renderConf(config, false));
  if (env) {
    await client.writeFile(token, uuid, `${BLIPMADE_DIR}/app.env`, renderEnv(env));
    await client.chmodFile(token, uuid, `${BLIPMADE_DIR}/app.env`, 0o600).catch(() => undefined);
  }
  // The server starts the managed script. The command it had is kept, to be given back.
  const server = await application.getServer(instance.pterodactylServerId as number);
  const current = server.container.startup_command;
  if (current !== GIT_STARTUP) {
    await application.updateServerStartup(instance.pterodactylServerId as number, { startup: GIT_STARTUP, skip_scripts: true });
    return { previousStartup: current };
  }
  return { previousStartup: null };
}

/** Puts a zip into the container and points the startup at it. The build runs there, not on the platform. */
export async function installArchive(
  instance: Instance,
  config: { buildCommand: string; startCommand: string },
  zip: Buffer,
): Promise<{ previousStartup: string | null }> {
  const token = await operations.customerToken(instance);
  const uuid = instance.pterodactylUuid as string;
  try { await client.createFolder(token, uuid, BLIPMADE_DIR); } catch { /* It exists already. */ }
  try { await client.createFolder(token, uuid, `${BLIPMADE_DIR}/inbox`); } catch { /* It exists already. */ }
  await client.writeFile(token, uuid, `${BLIPMADE_DIR}/run.sh`, RUN_SCRIPT);
  await client.writeFile(token, uuid, `${BLIPMADE_DIR}/deploy.conf`, renderConf({
    repoUrl: 'https://github.com/archive/archive',
    branch: 'main',
    buildCommand: config.buildCommand,
    startCommand: config.startCommand,
  }, true));
  await client.uploadFile(token, uuid, `${BLIPMADE_DIR}/inbox`, 'project.zip', zip);
  await client.decompressArchive(token, uuid, `${BLIPMADE_DIR}/inbox/project.zip`);
  await client.deleteFile(token, uuid, `${BLIPMADE_DIR}/inbox/project.zip`).catch(() => undefined);
  const server = await application.getServer(instance.pterodactylServerId as number);
  const current = server.container.startup_command;
  if (current !== GIT_STARTUP) {
    await application.updateServerStartup(instance.pterodactylServerId as number, { startup: GIT_STARTUP, skip_scripts: true });
    return { previousStartup: current };
  }
  return { previousStartup: null };
}

/** Gives the startup command back and leaves the files, which are the customer's. */
export async function uninstallGit(instance: Instance, previousStartup: string | null): Promise<void> {
  if (!previousStartup) return;
  await application.updateServerStartup(instance.pterodactylServerId as number, { startup: previousStartup, skip_scripts: true });
}

export interface DeployStatus {
  state: 'building' | 'built' | 'succeeded' | 'failed' | 'none';
  id: string;
  release: string;
  commit: string;
  at: string | null;
  message: string;
}

export async function readStatus(instance: Instance): Promise<DeployStatus> {
  try {
    const token = await operations.customerToken(instance);
    const file = await client.readFile(token, instance.pterodactylUuid as string, `${BLIPMADE_DIR}/status.json`);
    const parsed = JSON.parse(file.content) as Partial<DeployStatus>;
    return { state: (parsed.state as DeployStatus['state']) ?? 'none', id: parsed.id ?? '', release: parsed.release ?? '', commit: parsed.commit ?? '', at: parsed.at ?? null, message: parsed.message ?? '' };
  } catch {
    return { state: 'none', id: '', release: '', commit: '', at: null, message: '' };
  }
}

export async function readLog(instance: Instance, id: string): Promise<string> {
  if (!/^[0-9a-f-]{8,40}$/.test(id)) throw badRequest('That is not a deployment.');
  const token = await operations.customerToken(instance);
  const file = await client.readFile(token, instance.pterodactylUuid as string, `${BLIPMADE_DIR}/logs/${id}.log`);
  // The last 200 kB are enough, and the page never gets more.
  return file.content.length > 200_000 ? file.content.slice(-200_000) : file.content;
}

export async function listReleases(instance: Instance): Promise<string[]> {
  try {
    const token = await operations.customerToken(instance);
    const files = await client.listFiles(token, instance.pterodactylUuid as string, `${BLIPMADE_DIR}/releases`);
    return files.filter((file) => file.is_directory && /^\d{14}-[0-9a-f]{8}$/.test(file.name)).map((file) => file.name).sort().reverse();
  } catch {
    return [];
  }
}

export async function currentRelease(instance: Instance): Promise<string | null> {
  // The link is not readable through the panel API; the status of the last successful deploy names it.
  const status = await readStatus(instance);
  return (status.state === 'succeeded' || status.state === 'built') && status.release ? status.release : null;
}

export async function refreshGitHubAppCloneUrl(instanceId: string): Promise<void> {
  const source = await prisma.importSource.findFirst({
    where: { instanceId, githubInstallationId: { not: null }, githubRepositoryId: { not: null } },
    select: { githubInstallationId: true, githubRepositoryId: true, buildCommand: true, startCommand: true, branch: true, repoUrl: true },
  });
  if (!source?.githubInstallationId || !source.githubRepositoryId) return;
  const row = await prisma.gitDeploy.findUnique({ where: { instanceId } });
  if (!row) return;
  const { cloneUrlForRepository } = await import('./github-app/repositories.js');
  const { url } = await cloneUrlForRepository(source.githubInstallationId, source.githubRepositoryId);
  const instance = await operations.loadOwnedInstance(
    (await prisma.instance.findUnique({ where: { id: instanceId }, select: { userId: true } }))!.userId,
    instanceId,
  );
  await installGit(
    instance,
    {
      repoUrl: url,
      branch: source.branch || row.branch,
      buildCommand: row.buildCommand,
      startCommand: row.startCommand,
    },
    null,
  );
}

/**
 * Asks the container to build or roll back, restarts it, and waits for the answer of the script.
 * Returns the final status. Nothing here throws on a failed build: a failed build is an answer, not an error.
 */
export async function runDeploy(instance: Instance, id: string, action: 'build' | 'rollback' | 'archive', release?: string): Promise<DeployStatus> {
  const token = await operations.customerToken(instance);
  const uuid = instance.pterodactylUuid as string;
  const line = action === 'rollback' ? `rollback ${id} ${release ?? ''}\n` : `${action} ${id}\n`;
  await client.writeFile(token, uuid, `${BLIPMADE_DIR}/request`, line);
  await client.sendPower(token, uuid, 'restart');
  const deadline = Date.now() + (BUILD_TIMEOUT_SECONDS + 420) * 1000;
  let last: DeployStatus = { state: 'none', id: '', release: '', commit: '', at: null, message: '' };
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    last = await readStatus(instance);
    if (last.id !== id) continue;
    if (last.state === 'failed') return last;
    if (last.state === 'built' || last.state === 'succeeded') return last;
  }
  return { ...last, state: 'failed', message: 'The deployment did not finish in time.' };
}

export async function recordDeployEvent(instanceId: string, text: string): Promise<void> {
  await prisma.instanceEvent.create({ data: { instanceId, type: 'deploy', message: text } });
}
