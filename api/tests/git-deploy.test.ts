import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RUN_SCRIPT, cleanBranch, cleanCommand, cleanEnv, cleanRepoUrl, parseEnvValues, renderConf, renderEnv, shq, verifyGithubSignature,
} from '../src/services/git-deploy.js';

describe('git deploy: what is accepted', () => {
  it('takes a public https repository on a known host and nothing else', () => {
    expect(cleanRepoUrl('https://github.com/you/app.git')).toBe('https://github.com/you/app');
    expect(cleanRepoUrl('https://GitHub.com/you/app/')).toBe('https://github.com/you/app');
    for (const bad of ['http://github.com/you/app', 'git@github.com:you/app.git', 'https://token@github.com/you/app', 'https://example.com/you/app',
      'https://github.com:8080/you/app', 'https://10.0.0.5/you/app', 'file:///etc/passwd', 'https://github.com/you']) {
      expect(() => cleanRepoUrl(bad)).toThrow();
    }
  });
  it('checks branches, commands and variables', () => {
    expect(cleanBranch('feature/x-1')).toBe('feature/x-1');
    for (const bad of ['-rf', 'a..b', 'a b', 'x;rm', '']) expect(() => cleanBranch(bad)).toThrow();
    expect(cleanCommand('npm run build', 'b', false)).toBe('npm run build');
    expect(() => cleanCommand('a\nb', 'b', false)).toThrow();
    expect(() => cleanCommand('', 'start', true)).toThrow();
    expect(cleanEnv({ NODE_ENV: 'production' })).toEqual({ NODE_ENV: 'production' });
    expect(() => cleanEnv({ SERVER_PORT: '1' })).toThrow();
    expect(() => cleanEnv({ 'A-B': '1' })).toThrow();
    expect(() => cleanEnv({ A: 'x\ny' })).toThrow();
  });
});

describe('git deploy: what is written into the container', () => {
  it('quotes values so they cannot break out of the file', () => {
    expect(shq("it's")).toBe("'it'\\''s'");
    const env = { TOKEN: "a'b$(touch x)`id`" };
    const text = renderEnv(env);
    expect(parseEnvValues(text)).toEqual(env);
    const dir = mkdtempSync(join(tmpdir(), 'gitdeploy-'));
    writeFileSync(join(dir, 'app.env'), text);
    // Sourcing the file gives the value back exactly and runs nothing.
    const out = execFileSync('bash', ['-c', `set -a; . "${dir}/app.env"; printf %s "$TOKEN"`]).toString();
    expect(out).toBe(env.TOKEN);
    const conf = renderConf({ repoUrl: 'https://github.com/a/b', branch: 'main', buildCommand: "echo 'hi'; touch /tmp/nope", startCommand: 'npm start' });
    writeFileSync(join(dir, 'deploy.conf'), conf);
    expect(execFileSync('bash', ['-c', `. "${dir}/deploy.conf"; printf %s "$BUILD_CMD"`]).toString()).toBe("echo 'hi'; touch /tmp/nope");
  });
  it('is a valid script', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitdeploy-'));
    writeFileSync(join(dir, 'run.sh'), RUN_SCRIPT);
    execFileSync('bash', ['-n', join(dir, 'run.sh')]);
  });
});

describe('git deploy: the signed webhook', () => {
  it('accepts only the right signature', () => {
    const body = '{"ref":"refs/heads/main"}';
    const good = `sha256=${createHmac('sha256', 's3cret').update(body).digest('hex')}`;
    expect(verifyGithubSignature('s3cret', body, good)).toBe(true);
    expect(verifyGithubSignature('other', body, good)).toBe(false);
    expect(verifyGithubSignature('s3cret', body + ' ', good)).toBe(false);
    expect(verifyGithubSignature('s3cret', body, undefined)).toBe(false);
    expect(verifyGithubSignature('s3cret', body, 'sha1=abc')).toBe(false);
  });
});
