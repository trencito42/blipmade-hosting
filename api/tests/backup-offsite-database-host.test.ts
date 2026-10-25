import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The off-site backup has to be able to run on the production host.
 *
 * The script connects to the database with the url of the platform, and that
 * url carries the name of the database service of the compose network
 * ("postgres"). That name does not resolve from the host, because the
 * resolver of docker only answers inside the network. The host publishes the
 * port of the database on its own loopback address, so the script has to
 * rewrite the host of the url before it dumps.
 *
 * The script did not do that. Every run ended with "could not translate host
 * name postgres", so the copy off the host could never be made and the
 * finding about the missing off-site copy stayed open, no matter what the
 * local backup said. A local copy on a host that uses RAID 0 is not a
 * disaster recovery backup, so the missing rewrite closed nothing.
 *
 * The test runs the script for real, with a fake pg_dump and a fake
 * pg_restore on the PATH and a local directory as the off-site target. The
 * whole run is therefore covered: the dump, the packing of the payload, the
 * encryption, the read back of the copy, the upload and the check of the
 * size. The copy on the target is then decrypted again, so the test does not
 * take the word of the script for it.
 */

const ROOT = resolve(process.cwd(), '..');
const SCRIPTS_DIR = join(ROOT, 'scripts');
const COMMON = join(SCRIPTS_DIR, 'backup-common.sh');

/** The iteration count of the fallback encryption, kept small for the suite. */
const PBKDF2_ITER = '10000';
const PASSPHRASE = 'a passphrase that only exists in this test';

/** True when the tools the test needs are on the machine. */
function has(tool: string, args: string[] = ['--version']): boolean {
  const result = spawnSync(tool, args, { encoding: 'utf-8' });
  return !result.error && result.status === 0;
}

const TOOLS_AVAILABLE = has('bash') && has('openssl') && has('tar') && has('sha256sum');

/** Calls the helper of the shared backup library with a url. */
function hostUrl(url: string): string {
  const result = spawnSync(
    'bash',
    ['-c', `source "$1"; blipmade_host_database_url "$2"`, 'bash', COMMON, url],
    { encoding: 'utf-8' },
  );
  if (result.status !== 0) {
    throw new Error(`the helper failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

describe('the local backup', () => {
  it.skipIf(!TOOLS_AVAILABLE)('keeps the password out of the process list', () => {
    // The nightly unit runs scripts/backup.sh, so the url of the database must
    // not carry the password there either: the password of the database is
    // readable by every process of the machine while the dump runs.
    const workdir = mkdtempSync(join(tmpdir(), 'blipmade-backup-'));
    const binDir = join(workdir, 'bin');
    const uploads = join(workdir, 'uploads');
    mkdirSync(binDir, { recursive: true });
    mkdirSync(uploads, { recursive: true });
    cpSync(SCRIPTS_DIR, join(workdir, 'scripts'), { recursive: true });

    const dumpLog = join(workdir, 'pg_dump.argv');
    const pgDump = join(binDir, 'pg_dump');
    writeFileSync(
      pgDump,
      [
        '#!/usr/bin/env bash',
        'printf "%s\\n" "$*" >> "$FAKE_PG_DUMP_LOG"',
        'target=""',
        'for argument in "$@"; do',
        '  case "$argument" in',
        '    --file=*) target="${argument#--file=}" ;;',
        '  esac',
        'done',
        'if [[ -n "$target" ]]; then printf "FAKE DUMP\\n" > "$target"; fi',
        'exit 0',
        '',
      ].join('\n'),
    );
    chmodSync(pgDump, 0o755);

    const result = spawnSync('bash', [join(workdir, 'scripts', 'backup.sh'), 'test'], {
      cwd: workdir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        FAKE_PG_DUMP_LOG: dumpLog,
        DATABASE_URL: 'postgresql://blipmade:secret@postgres:5432/blipmade',
        BACKUP_DIR: join(workdir, 'backups'),
        OFFSITE_UPLOAD_DIR: uploads,
      },
    });

    expect(result.status, `the script failed:\n${result.stdout}\n${result.stderr}`).toBe(0);

    const argv = readFileSync(dumpLog, 'utf-8').trim();
    expect(argv).toContain('localhost:5432');
    expect(argv).not.toContain('postgres:5432');
    // The password is not in the command line of the dump.
    expect(argv).not.toContain('secret');
  });
});

describe('the url of the database on the host', () => {
  it('points to the loopback address of the host and not to the compose service', () => {
    expect(hostUrl('postgresql://blipmade:secret@postgres:5432/blipmade')).toBe(
      'postgresql://blipmade:secret@localhost:5432/blipmade',
    );
  });

  it('keeps the port and the name of the database', () => {
    const url = hostUrl('postgresql://blipmade:secret@postgres:5432/blipmade');
    expect(url).toContain('localhost:5432');
    expect(url).toContain('/blipmade');
    expect(url).not.toContain('postgres:5432');
  });

  it('finds the host after the last "@", so a password may hold one', () => {
    expect(hostUrl('postgresql://blipmade:p@ss@postgres:5432/blipmade')).toBe(
      'postgresql://blipmade:p@ss@localhost:5432/blipmade',
    );
  });

  it('rewrites a url without credentials', () => {
    expect(hostUrl('postgresql://postgres:5432/blipmade')).toBe(
      'postgresql://localhost:5432/blipmade',
    );
  });

  it('rewrites the name of the cache as well', () => {
    expect(hostUrl('redis://:secret@redis:6379/0')).toBe('redis://:secret@localhost:6379/0');
  });

  it('leaves a url alone that does not carry the name of a service', () => {
    const url = 'postgresql://blipmade:secret@db.example.com:5432/blipmade';
    expect(hostUrl(url)).toBe(url);
  });
});

describe('the off-site backup', () => {
  it.skipIf(!TOOLS_AVAILABLE)('runs from the host and leaves a copy on the target', () => {
    const workdir = mkdtempSync(join(tmpdir(), 'blipmade-offsite-'));
    const target = join(workdir, 'target');
    const uploads = join(workdir, 'uploads');
    const binDir = join(workdir, 'bin');
    mkdirSync(uploads, { recursive: true });
    mkdirSync(binDir, { recursive: true });

    // The script works from the directory that holds it, so it is copied
    // into a directory of its own. The copy has no environment file, so the
    // run cannot be steered by the configuration of the machine.
    cpSync(SCRIPTS_DIR, join(workdir, 'scripts'), { recursive: true });

    // The PostgreSQL tools are faked. The script takes the tool from the
    // PATH when it is there, so the fake wins and the real database is never
    // touched. The fake writes every argument it was given into a log, so the
    // test can see the host the script used and can see whether a secret
    // reached the process list.
    const dumpLog = join(workdir, 'pg_dump.url');
    const pgDump = join(binDir, 'pg_dump');
    writeFileSync(
      pgDump,
      [
        '#!/usr/bin/env bash',
        'printf "%s\\n" "$*" >> "$FAKE_PG_DUMP_LOG"',
        'target=""',
        'for argument in "$@"; do',
        '  case "$argument" in',
        '    --file=*) target="${argument#--file=}" ;;',
        '  esac',
        'done',
        'if [[ -n "$target" ]]; then printf "FAKE DUMP\\n" > "$target"; fi',
        'exit 0',
        '',
      ].join('\n'),
    );
    chmodSync(pgDump, 0o755);

    const pgRestore = join(binDir, 'pg_restore');
    writeFileSync(pgRestore, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(pgRestore, 0o755);

    const result = spawnSync('bash', [join(workdir, 'scripts', 'backup-offsite.sh')], {
      cwd: workdir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        FAKE_PG_DUMP_LOG: dumpLog,
        DATABASE_URL: 'postgresql://blipmade:secret@postgres:5432/blipmade',
        OFFSITE_TARGET: target,
        OFFSITE_TRANSPORT: 'local',
        OFFSITE_ENCRYPTION_KEY: PASSPHRASE,
        OFFSITE_PBKDF2_ITER: PBKDF2_ITER,
        // The keys of the machine must not leak into the run of the test.
        OFFSITE_AGE_RECIPIENT: '',
        OFFSITE_AGE_IDENTITY: '',
        BACKUP_DIR: join(workdir, 'backups'),
        OFFSITE_UPLOAD_DIR: uploads,
        ATTACHMENT_DIR: uploads,
      },
    });

    expect(result.status, `the script failed:\n${result.stdout}\n${result.stderr}`).toBe(0);

    // The dump went to the loopback address of the host and not to the name
    // of the compose service, which cannot be resolved from the host.
    expect(existsSync(dumpLog)).toBe(true);
    const usedUrl = readFileSync(dumpLog, 'utf-8').trim();
    expect(usedUrl).toContain('localhost:5432');
    expect(usedUrl).not.toContain('postgres:5432');

    // The password of the database is handed to libpq through the
    // environment, so it never shows up in the process list of the machine.
    expect(usedUrl).not.toContain('secret');
    expect(usedUrl).not.toContain('blipmade:secret');

    // The copy is on the target, and it is the only thing that is left: the
    // local copy is removed after the copy on the target was verified.
    const copies = readdirSync(target).filter((name) => name.endsWith('.tar.gz.enc'));
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatch(/^blipmade-offsite-\d{8}T\d{6}Z\.tar\.gz\.enc$/);
    expect(readdirSync(join(workdir, 'backups', 'offsite'))).toEqual([]);

    // The copy on the target is decrypted again and holds the dump, so the
    // test does not take the word of the script for it.
    const decrypted = join(workdir, 'payload.tar.gz');
    const restore = spawnSync(
      'openssl',
      [
        'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', PBKDF2_ITER, '-md', 'sha256',
        '-pass', 'env:OFFSITE_ENCRYPTION_KEY',
        '-in', join(target, copies[0]),
        '-out', decrypted,
      ],
      { encoding: 'utf-8', env: { ...process.env, OFFSITE_ENCRYPTION_KEY: PASSPHRASE } },
    );
    expect(restore.status, `the copy could not be read: ${restore.stderr}`).toBe(0);

    const listing = spawnSync('tar', ['-tzf', decrypted], { encoding: 'utf-8' });
    expect(listing.status).toBe(0);
    expect(listing.stdout).toContain('database.dump');
  });

  it.skipIf(!TOOLS_AVAILABLE)('fails when the database host cannot be resolved', () => {
    // The host that the script uses is the one that has to work. A url that
    // points somewhere else is left alone on purpose, so a wrong host is
    // visible in the log of the run instead of being hidden.
    const workdir = mkdtempSync(join(tmpdir(), 'blipmade-offsite-'));
    const binDir = join(workdir, 'bin');
    mkdirSync(binDir, { recursive: true });
    cpSync(SCRIPTS_DIR, join(workdir, 'scripts'), { recursive: true });

    const dumpLog = join(workdir, 'pg_dump.url');
    const pgDump = join(binDir, 'pg_dump');
    writeFileSync(
      pgDump,
      [
        '#!/usr/bin/env bash',
        'printf "%s\\n" "$1" >> "$FAKE_PG_DUMP_LOG"',
        'echo "could not translate host name $2" >&2',
        'exit 1',
        '',
      ].join('\n'),
    );
    chmodSync(pgDump, 0o755);

    const result = spawnSync('bash', [join(workdir, 'scripts', 'backup-offsite.sh')], {
      cwd: workdir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        FAKE_PG_DUMP_LOG: dumpLog,
        DATABASE_URL: 'postgresql://blipmade:secret@db.example.com:5432/blipmade',
        OFFSITE_TARGET: join(workdir, 'target'),
        OFFSITE_TRANSPORT: 'local',
        OFFSITE_ENCRYPTION_KEY: PASSPHRASE,
        OFFSITE_PBKDF2_ITER: PBKDF2_ITER,
        OFFSITE_AGE_RECIPIENT: '',
        OFFSITE_AGE_IDENTITY: '',
        BACKUP_DIR: join(workdir, 'backups'),
        OFFSITE_UPLOAD_DIR: join(workdir, 'uploads'),
      },
    });

    expect(result.status).not.toBe(0);
    // The host that is not a compose service is left as it is, so the run
    // fails with the message of the tool instead of writing a wrong copy.
    const usedUrl = readFileSync(dumpLog, 'utf-8').trim();
    expect(usedUrl).toContain('db.example.com:5432');
    expect(result.stderr).toContain('could not translate host name');
  });

  it.skipIf(!TOOLS_AVAILABLE)('keeps the local copy when the upload does not work', () => {
    // A copy that cannot reach the target must not be thrown away: the local
    // copy is the only one that is left, and it is the one the upload can be
    // repeated with.
    const workdir = mkdtempSync(join(tmpdir(), 'blipmade-offsite-'));
    const binDir = join(workdir, 'bin');
    const uploads = join(workdir, 'uploads');
    const target = join(workdir, 'target');
    mkdirSync(binDir, { recursive: true });
    mkdirSync(uploads, { recursive: true });
    cpSync(SCRIPTS_DIR, join(workdir, 'scripts'), { recursive: true });

    const pgDump = join(binDir, 'pg_dump');
    writeFileSync(
      pgDump,
      [
        '#!/usr/bin/env bash',
        'target=""',
        'for argument in "$@"; do',
        '  case "$argument" in',
        '    --file=*) target="${argument#--file=}" ;;',
        '  esac',
        'done',
        'if [[ -n "$target" ]]; then printf "FAKE DUMP\\n" > "$target"; fi',
        'exit 0',
        '',
      ].join('\n'),
    );
    chmodSync(pgDump, 0o755);

    const result = spawnSync('bash', [join(workdir, 'scripts', 'backup-offsite.sh')], {
      cwd: workdir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        DATABASE_URL: 'postgresql://blipmade:secret@postgres:5432/blipmade',
        // The target cannot be written to, so the upload fails.
        OFFSITE_TARGET: '/proc/self/cannot-write-here',
        OFFSITE_TRANSPORT: 'local',
        OFFSITE_ENCRYPTION_KEY: PASSPHRASE,
        OFFSITE_PBKDF2_ITER: PBKDF2_ITER,
        OFFSITE_AGE_RECIPIENT: '',
        OFFSITE_AGE_IDENTITY: '',
        BACKUP_DIR: join(workdir, 'backups'),
        OFFSITE_UPLOAD_DIR: uploads,
      },
    });

    expect(result.status, `the run should have failed:\n${result.stdout}\n${result.stderr}`).not.toBe(0);

    // The local copy is still there, so the upload can be repeated.
    const kept = readdirSync(join(workdir, 'backups', 'offsite'));
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatch(/\.tar\.gz\.enc$/);
  });
});
