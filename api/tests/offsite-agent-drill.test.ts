import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd(), '..');
const AGENT = join(ROOT, 'scripts', 'offsite-agent.sh');

function has(tool: string): boolean {
  const result = spawnSync(tool, ['--version'], { encoding: 'utf-8' });
  return !result.error && result.status === 0;
}

const TOOLS = has('bash') && has('age') && has('age-keygen') && has('tar') && has('gzip');

function runAgent(env: NodeJS.ProcessEnv, args: string[]) {
  return spawnSync('bash', [AGENT, ...args], { encoding: 'utf-8', env: { ...process.env, ...env } });
}

describe.skipIf(!TOOLS)('offsite-agent drill evidence', () => {
  it('posts decrypt-verified and leaves no plaintext after success or failure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'offsite-drill-'));
    const ident = join(dir, 'id');
    const identWrong = join(dir, 'id-wrong');
    const staging = join(dir, 'staging');
    const local = join(dir, 'box');
    const bin = join(dir, 'bin');
    const posts = join(dir, 'posts.log');
    mkdirSync(staging, { recursive: true });
    mkdirSync(join(local, 'blipmade', 'platform', 'node'), { recursive: true });
    mkdirSync(bin);

    const gen = spawnSync('age-keygen', ['-o', ident], { encoding: 'utf-8' });
    expect(gen.status).toBe(0);
    const recipient = spawnSync('age-keygen', ['-y', ident], { encoding: 'utf-8' }).stdout.trim();
    spawnSync('age-keygen', ['-o', identWrong], { encoding: 'utf-8' });

    writeFileSync(join(dir, 'hello.txt'), 'hello\n');
    const tar = join(dir, 'sample.tar.gz');
    spawnSync('tar', ['-czf', tar, '-C', dir, 'hello.txt'], { encoding: 'utf-8' });
    const ageFile = join(local, 'blipmade', 'platform', 'node', 'sample.tar.gz.age');
    const enc = spawnSync('age', ['-r', recipient, '-o', ageFile, tar], { encoding: 'utf-8' });
    expect(enc.status).toBe(0);

    writeFileSync(
      join(bin, 'curl'),
      `#!/usr/bin/env bash
printf '%s %s\\n' "$*" >> "$POSTS_LOG"
exit 0
`,
    );
    chmodSync(join(bin, 'curl'), 0o755);

    const env: NodeJS.ProcessEnv = {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      OFFSITE_ENV_FILE: '/dev/null',
      OFFSITE_TRANSPORT: 'local',
      OFFSITE_LOCAL_DIR: local,
      OFFSITE_BASE: 'blipmade',
      STATE_DIR: join(dir, 'state'),
      STAGING_DIR: staging,
      REPORT_URL: 'http://127.0.0.1/api/internal/backups',
      REPORT_TOKEN: 'test',
      POSTS_LOG: posts,
    };

    const ok = runAgent(env, ['drill', 'platform/node/sample.tar.gz.age', ident]);
    expect(ok.status, ok.stderr + ok.stdout).toBe(0);
    expect(ok.stdout).toMatch(/not a restore/);
    const posted = readFileSync(posts, 'utf8');
    expect(posted).toMatch(/decrypt-verified/);
    expect(posted).not.toMatch(/restore-verified/);
    expect(readdirSync(staging)).toEqual([]);

    const fail = runAgent(env, ['drill', 'platform/node/sample.tar.gz.age', identWrong]);
    expect(fail.status).not.toBe(0);
    expect(readdirSync(staging)).toEqual([]);
  });
});
