import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The encrypted copy that leaves the host is the only backup that survives
 * the loss of the host, because the host uses RAID 0.
 *
 * The drill of the local archive (scripts/restore-drill.sh) proved that the
 * archive of the host restores. It proved nothing about the encrypted copy
 * on the off-site target: that copy was written, its size was compared with
 * the local one, and nobody ever read it back and restored it.
 *
 * The script scripts/restore-offsite-drill.sh does exactly that: it reads the
 * newest copy down from the target, decrypts it and restores it into a
 * scratch database.
 *
 * The test guards the two things that would make the drill dangerous:
 *
 *  - it must refuse to run when the name of the database it writes into is
 *    not a scratch name, and it must refuse before it touches anything, so
 *    a mistyped name can never reach the live database;
 *  - the live database must never be a restore target.
 *
 * The test never performs a real restore and it never uses the network: the
 * PostgreSQL tools and the ssh tools are faked, and the off-site target is a
 * directory of the test itself.
 */

const ROOT = resolve(process.cwd(), '..');
const SCRIPTS_DIR = join(ROOT, 'scripts');
const DRILL = join(SCRIPTS_DIR, 'restore-offsite-drill.sh');
const DOC = join(ROOT, 'docs', 'BACKUP-DISASTER-RECOVERY.md');

/** The name of the live database of the platform. It must never be written to. */
const LIVE_DB = 'blipmade';

/** The scratch database the drill uses when it is not told otherwise. */
const SCRATCH_DB = 'blipmade_offsite_drill';

/** The iteration count of the fallback encryption, kept small for the suite. */
const PBKDF2_ITER = '10000';
const PASSPHRASE = 'a passphrase that only exists in this test';

/** True when the tools the test needs are on the machine. */
function has(tool: string, args: string[] = ['--version']): boolean {
  const result = spawnSync(tool, args, { encoding: 'utf-8' });
  return !result.error && result.status === 0;
}

const TOOLS_AVAILABLE =
  has('bash') && has('openssl') && has('tar') && has('sha256sum') && has('md5sum');

/** Writes an executable helper that appends every argument to a log file. */
function fakeTool(binDir: string, name: string, body: string[] = []): void {
  const path = join(binDir, name);
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$FAKE_TOOL_LOG"',
      ...body,
      'exit 0',
      '',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
}

/** The PostgreSQL tools that the drill calls, faked so no database is touched. */
function fakeDatabaseTools(binDir: string): void {
  // The answers of the counts. The drill compares the live database with the
  // restored one, so both answers are the same number and the comparison
  // passes.
  fakeTool(binDir, 'psql', [
    'query=""',
    'for argument in "$@"; do query="$argument"; done',
    'case "$query" in',
    '  *information_schema.tables*) printf "40\\n" ;;',
    '  *_prisma_migrations*) printf "17\\n" ;;',
    '  *"Product"*) printf "5\\n" ;;',
    '  *"User"*) printf "4\\n" ;;',
    'esac',
  ]);
  fakeTool(binDir, 'pg_restore');
  fakeTool(binDir, 'pg_dump');
}

/** Builds a payload that looks like the one the off-site script writes. */
function buildPayload(workdir: string): string {
  const stage = join(workdir, 'stage');
  const uploads = join(workdir, 'uploads');
  mkdirSync(stage, { recursive: true });
  mkdirSync(uploads, { recursive: true });
  writeFileSync(join(stage, 'database.dump'), 'a dump that only has to be listed\n');
  writeFileSync(join(uploads, 'a-file.txt'), 'an attachment of a customer\n');

  const config = join(workdir, 'config');
  mkdirSync(config, { recursive: true });
  writeFileSync(join(config, 'compose.yml'), 'services: {}\n');

  spawnSync('tar', ['-czf', join(stage, 'uploads.tar.gz'), '-C', uploads, '.'], { encoding: 'utf-8' });
  spawnSync('tar', ['-czf', join(stage, 'config.tar.gz'), '-C', config, '.'], { encoding: 'utf-8' });

  const payload = join(workdir, 'payload.tar.gz');
  spawnSync(
    'tar',
    ['-czf', payload, '-C', stage, 'database.dump', 'uploads.tar.gz', 'config.tar.gz'],
    { encoding: 'utf-8' },
  );
  return payload;
}

describe('the off-site restore drill', () => {
  it.skipIf(!TOOLS_AVAILABLE)('refuses the name of the live database', () => {
    // The live database must never be a restore target. The name of the
    // scratch database has to end with _test or _drill, so the name of the
    // live database is refused before the script touches anything at all.
    const workdir = mkdtempSync(join(tmpdir(), 'blipmade-offsite-drill-'));
    const binDir = join(workdir, 'bin');
    const target = join(workdir, 'target');
    mkdirSync(binDir, { recursive: true });
    mkdirSync(target, { recursive: true });
    cpSync(SCRIPTS_DIR, join(workdir, 'scripts'), { recursive: true });

    // Every tool that could touch the machine is faked and every call is
    // written into a log, so the test can prove that nothing was called.
    const toolLog = join(workdir, 'tools.log');
    fakeTool(binDir, 'age');
    fakeTool(binDir, 'openssl');
    fakeTool(binDir, 'ssh');
    fakeTool(binDir, 'scp');
    fakeTool(binDir, 'rclone');
    fakeDatabaseTools(binDir);

    const result = spawnSync('bash', [join(workdir, 'scripts', 'restore-offsite-drill.sh')], {
      cwd: workdir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        FAKE_TOOL_LOG: toolLog,
        DATABASE_URL: 'postgresql://blipmade:secret@postgres:5432/blipmade',
        OFFSITE_TARGET: target,
        OFFSITE_TRANSPORT: 'local',
        OFFSITE_ENCRYPTION_KEY: PASSPHRASE,
        OFFSITE_PBKDF2_ITER: PBKDF2_ITER,
        OFFSITE_AGE_RECIPIENT: '',
        OFFSITE_AGE_IDENTITY: '',
        SCRATCH_DB: LIVE_DB,
      },
    });

    expect(result.status, `the run should have failed:\n${result.stdout}\n${result.stderr}`).not.toBe(0);
    expect(result.stderr).toContain('_test');
    expect(result.stderr).toContain('_drill');

    // Nothing was called: the refusal comes before the target is even
    // listed, so no copy was read and no database was touched.
    expect(existsSync(toolLog), 'a tool was called before the refusal').toBe(false);
  });

  it.skipIf(!TOOLS_AVAILABLE)('refuses a name that is not a scratch name', () => {
    // The name of the scratch database is what keeps the drill away from the
    // live database. A name that does not say that it is a scratch database
    // is refused, whatever it is.
    const workdir = mkdtempSync(join(tmpdir(), 'blipmade-offsite-drill-'));
    const binDir = join(workdir, 'bin');
    const target = join(workdir, 'target');
    mkdirSync(binDir, { recursive: true });
    mkdirSync(target, { recursive: true });
    cpSync(SCRIPTS_DIR, join(workdir, 'scripts'), { recursive: true });

    const toolLog = join(workdir, 'tools.log');
    fakeTool(binDir, 'age');
    fakeTool(binDir, 'openssl');
    fakeTool(binDir, 'ssh');
    fakeTool(binDir, 'scp');
    fakeTool(binDir, 'rclone');
    fakeDatabaseTools(binDir);

    const result = spawnSync('bash', [join(workdir, 'scripts', 'restore-offsite-drill.sh')], {
      cwd: workdir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        FAKE_TOOL_LOG: toolLog,
        DATABASE_URL: 'postgresql://blipmade:secret@postgres:5432/blipmade',
        OFFSITE_TARGET: target,
        OFFSITE_TRANSPORT: 'local',
        OFFSITE_ENCRYPTION_KEY: PASSPHRASE,
        OFFSITE_PBKDF2_ITER: PBKDF2_ITER,
        OFFSITE_AGE_RECIPIENT: '',
        OFFSITE_AGE_IDENTITY: '',
        SCRATCH_DB: 'blipmade_restore_check',
      },
    });

    expect(result.status, `the run should have failed:\n${result.stdout}\n${result.stderr}`).not.toBe(0);
    expect(result.stderr).toContain('_test');
    expect(result.stderr).toContain('_drill');
    expect(existsSync(toolLog), 'a tool was called before the refusal').toBe(false);
  });

  it.skipIf(!TOOLS_AVAILABLE)('restores into the scratch database and never into the live one', () => {
    // The whole drill runs here with a directory as the off-site target, so
    // the copy is read, decrypted and restored without the network. The
    // PostgreSQL tools are faked, and they write every argument they were
    // given into a log, so the test can see which database was written into.
    const workdir = mkdtempSync(join(tmpdir(), 'blipmade-offsite-drill-'));
    const binDir = join(workdir, 'bin');
    const target = join(workdir, 'target');
    mkdirSync(binDir, { recursive: true });
    mkdirSync(target, { recursive: true });
    cpSync(SCRIPTS_DIR, join(workdir, 'scripts'), { recursive: true });

    const toolLog = join(workdir, 'tools.log');
    fakeDatabaseTools(binDir);

    const payload = buildPayload(workdir);
    const copy = join(target, 'blipmade-offsite-20260101T000000Z.tar.gz.enc');
    const encrypted = spawnSync(
      'openssl',
      [
        'enc', '-aes-256-cbc', '-pbkdf2', '-iter', PBKDF2_ITER, '-md', 'sha256',
        '-pass', 'env:OFFSITE_ENCRYPTION_KEY',
        '-in', payload,
        '-out', copy,
      ],
      { encoding: 'utf-8', env: { ...process.env, OFFSITE_ENCRYPTION_KEY: PASSPHRASE } },
    );
    expect(encrypted.status, `the copy could not be written: ${encrypted.stderr}`).toBe(0);

    const result = spawnSync('bash', [join(workdir, 'scripts', 'restore-offsite-drill.sh')], {
      cwd: workdir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        FAKE_TOOL_LOG: toolLog,
        DATABASE_URL: 'postgresql://blipmade:secret@postgres:5432/blipmade',
        OFFSITE_TARGET: target,
        OFFSITE_TRANSPORT: 'local',
        OFFSITE_ENCRYPTION_KEY: PASSPHRASE,
        OFFSITE_PBKDF2_ITER: PBKDF2_ITER,
        OFFSITE_AGE_RECIPIENT: '',
        OFFSITE_AGE_IDENTITY: '',
        SCRATCH_DB: SCRATCH_DB,
        // The uploads of the test are in a directory of their own, so the
        // drill expects them in the copy, exactly like on the host.
        OFFSITE_UPLOAD_DIR: join(workdir, 'uploads'),
      },
    });

    expect(result.status, `the drill failed:\n${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('PASS');

    const log = readFileSync(toolLog, 'utf-8');

    // The restore went into the scratch database and into nothing else.
    const restoreTargets = [...log.matchAll(/-d (\S+)/g)].map((match) => match[1]);
    expect(restoreTargets.length).toBeGreaterThan(0);
    for (const url of restoreTargets) {
      expect(url.endsWith(`/${SCRATCH_DB}`), `the restore went into ${url}`).toBe(true);
      expect(url.endsWith(`/${LIVE_DB}`), `the restore went into ${url}`).toBe(false);
    }

    // Only the scratch database was created and only the scratch database was
    // dropped. The live database is never named in a statement that changes
    // a database.
    const databases = [...log.matchAll(/(?:DROP|CREATE) DATABASE (?:IF EXISTS )?"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(databases.length).toBeGreaterThan(0);
    for (const name of databases) {
      expect(name).toBe(SCRATCH_DB);
      expect(name).not.toBe(LIVE_DB);
    }
  });

  it('does not name the live database as a restore target', () => {
    // The source of the script is read as well: a script that carried the
    // name of the live database in it would be one edit away from a restore
    // into the live database.
    const source = readFileSync(DRILL, 'utf-8');

    expect(source).not.toMatch(/"blipmade"/);
    expect(source).not.toMatch(/'blipmade'/);
    expect(source).not.toMatch(/\/blipmade["']/);

    // The default scratch database says that it is one.
    const fallback = source.match(/SCRATCH_DB="\$\{SCRATCH_DB:-([^}]+)\}"/);
    expect(fallback, 'the script has no default scratch database').not.toBeNull();
    expect(fallback?.[1]).toMatch(/(_test|_drill)$/);
    expect(fallback?.[1]).not.toBe(LIVE_DB);

    // The refusal is in the script and it is made before anything is read.
    expect(source).toMatch(/_test\|_drill/);
    const refusal = source.indexOf('Refusing to run');
    const listing = source.indexOf('remote_list');
    expect(refusal).toBeGreaterThan(-1);
    expect(listing).toBeGreaterThan(-1);
    expect(refusal).toBeLessThan(listing);
  });
});

describe('the documentation of the disaster recovery', () => {
  it('names the recovery of the encryption identity', () => {
    // The identity of age is the key of the backups. Without it the copy on
    // the target is unreadable, so the way to get it back has to be written
    // down, with the path of the file and not with the key itself.
    expect(existsSync(DOC), 'docs/BACKUP-DISASTER-RECOVERY.md is missing').toBe(true);
    const doc = readFileSync(DOC, 'utf-8');

    expect(doc).toContain('OFFSITE_AGE_IDENTITY');
    expect(doc).toContain('/home/debian/.blipmade-backup.age');
    expect(doc).toContain('OFFSITE_TARGET');
    expect(doc).toMatch(/identity/i);
    expect(doc).toMatch(/scp|install -m 600/);

    // The key itself is never in the documentation.
    expect(doc).not.toContain('AGE-SECRET-KEY');
  });

  it('names the drill that proves the off-site copy', () => {
    const doc = readFileSync(DOC, 'utf-8');
    expect(doc).toContain('scripts/restore-offsite-drill.sh');
    expect(doc).toContain('scripts/smoke-production.sh');
  });
});
