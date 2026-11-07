#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
proof_root=$(mktemp -d /tmp/blipmade-sandbox-server-proof.XXXXXX)
case "$proof_root" in /tmp/blipmade-sandbox-server-proof.*) ;; *) exit 70 ;; esac
proof_port=$((43000 + $$ % 1000))
proof_secret='sandbox-proof-secret-32-characters-long'
server_pid=''

cleanup() {
  if [[ "$server_pid" =~ ^[1-9][0-9]*$ ]]; then kill "$server_pid" 2>/dev/null || true; fi
  case "$proof_root" in
    /tmp/blipmade-sandbox-server-proof.*) rm -rf -- "$proof_root" ;;
  esac
}
trap cleanup EXIT INT TERM

SMART_DEPLOY_SANDBOX_SECRET="$proof_secret" \
SMART_DEPLOY_STATE_DIR="$proof_root/state" \
PORT="$proof_port" \
node "$repo_root/scripts/smart-deploy-sandbox-server.mjs" > "$proof_root/server.log" 2>&1 &
server_pid=$!

for _ in {1..50}; do
  if curl --fail --silent "http://127.0.0.1:$proof_port/health" >/dev/null; then break; fi
  sleep 0.1
done
curl --fail --silent "http://127.0.0.1:$proof_port/health" >/dev/null

PROOF_PORT="$proof_port" PROOF_ROOT="$proof_root" PROOF_SECRET="$proof_secret" node --input-type=module <<'NODE'
import { createHash, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.env.PROOF_ROOT;
const port = process.env.PROOF_PORT;
const secret = process.env.PROOF_SECRET;
const source = join(root, 'source');
await mkdir(source);
await writeFile(join(source, 'package.json'), JSON.stringify({ scripts: { build: 'mkdir -p dist && printf verified > dist/result.txt' } }));
const good = join(root, 'good.tar.gz');
// GitHub tarballs have one generated top-level directory; the extractor strips it.
execFileSync('tar', ['-C', root, '-czf', good, 'source']);

async function send(jobId, archive, signatureSecret = secret, buildCommand = 'npm run build') {
  const bytes = await readFile(archive);
  const raw = Buffer.from(JSON.stringify({
    runtime: 'node',
    buildCommand,
    archiveSha256: createHash('sha256').update(bytes).digest('hex'),
    archiveBase64: bytes.toString('base64'),
  }));
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', signatureSecret).update(`${timestamp}.${jobId}.`).update(raw).digest('hex');
  const response = await fetch(`http://127.0.0.1:${port}/builds/${jobId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-blipmade-timestamp': timestamp, 'x-blipmade-signature': `sha256=${signature}` },
    body: raw,
  });
  return { response, body: await response.json() };
}

const accepted = await send('accepted', good);
if (accepted.response.status !== 200 || accepted.body.status !== 'succeeded' || !/^[a-f0-9]{64}$/.test(accepted.body.artifactSha256)) {
  throw new Error(`signed build was not accepted: ${JSON.stringify(accepted.body)}`);
}
const unauthorized = await send('unauthorized', good, 'wrong-secret-that-is-still-long-enough');
if (unauthorized.response.status !== 401) throw new Error('invalid signature was accepted');

const slowBuild = send('cancel-me', good, secret, 'sleep 30');
await new Promise((resolve) => setTimeout(resolve, 500));
const cancelTimestamp = String(Date.now());
const cancelSignature = createHmac('sha256', secret).update(`${cancelTimestamp}.cancel-me.`).digest('hex');
const cancelled = await fetch(`http://127.0.0.1:${port}/builds/cancel-me`, {
  method: 'DELETE',
  headers: { 'x-blipmade-timestamp': cancelTimestamp, 'x-blipmade-signature': `sha256=${cancelSignature}` },
});
if (cancelled.status !== 202 || (await cancelled.json()).status !== 'cancelling') throw new Error('active build was not cancelled');
const stopped = await slowBuild;
if (stopped.response.status !== 422 || stopped.body.status !== 'failed') throw new Error('cancelled build still succeeded');

const malicious = join(root, 'malicious.tar.gz');
execFileSync('/usr/bin/python3', ['-c', [
  'import io,sys,tarfile',
  'with tarfile.open(sys.argv[1], "w:gz") as out:',
  ' info=tarfile.TarInfo("../escape")',
  ' info.size=4',
  ' out.addfile(info, io.BytesIO(b"evil"))',
].join('\n'), malicious]);
const rejected = await send('malicious', malicious);
if (rejected.response.status !== 422 || !String(rejected.body.error).includes('archive_rejected')) {
  throw new Error(`traversal archive was not rejected: ${JSON.stringify(rejected.body)}`);
}
NODE

test ! -e "$proof_root/escape"
printf 'sandbox server proof passed: signed dispatch, real artifact, remote cancel, auth refusal and traversal refusal\n'
