import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A script must not stop in the middle of its work because of a pipe.
 *
 * `head` closes the pipe as soon as it has printed its lines, so the program
 * that writes into it is killed by SIGPIPE and ends with the status 141. In a
 * script that watches the pipes that status turns a command that worked into
 * the failure of the whole script.
 *
 * The restore of a backup did exactly that. The listing of the dump ended
 * with the status 141, the script stopped before it restored a single table,
 * and the log of the operator still said that the restore was complete. The
 * drill of the restore proved it on the day: the script of the day restored
 * nothing and answered with the status 141, the script of today restores the
 * twenty eight tables of the dump and answers with the status 0.
 *
 * `sed -n '1,20p'` reads the whole input and then prints the first lines, so
 * the pipe is never closed under the writer and the script sees the status of
 * the writer.
 */

const ROOT = resolve(process.cwd(), '..');
const SCRIPTS_DIR = join(ROOT, 'scripts');

/** Every shell script of the platform, in every directory. */
async function shellScripts(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await shellScripts(path)));
    else if (entry.name.endsWith('.sh')) files.push(path);
  }
  return files.sort();
}

/** True when the script watches the pipes of its commands. */
function watchesPipes(source: string): boolean {
  return /^set\s+.*\bpipefail\b/m.test(source);
}

/** The lines of the script that pipe into head. */
function pipesIntoHead(source: string): string[] {
  const lines = source.split('\n');
  const found: string[] = [];
  let previousEndedWithPipe = false;
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      previousEndedWithPipe = false;
      return;
    }
    const pipes = /\|\s*head\b/.test(line);
    const continues = previousEndedWithPipe && /^head\b/.test(line);
    if (pipes || continues) found.push(`${index + 1}: ${line}`);
    previousEndedWithPipe = /\|$/.test(raw);
  });
  return found;
}

describe('the scripts of the platform', () => {
  it('never pipe into head when a broken pipe would take the script down', async () => {
    const files = await shellScripts(SCRIPTS_DIR);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, 'utf-8');
      if (!watchesPipes(source)) continue;
      for (const line of pipesIntoHead(source)) {
        offenders.push(`${relative(ROOT, file)}:${line}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('shows why the rule exists', () => {
    // A small output fits in the buffer of the pipe, so the writer is done
    // before head closes it and the failure does not show. The output of the
    // listing of a dump is larger than the buffer, and that is the case that
    // stopped the restore of a backup.
    const broken = spawnSync('bash', ['-c', 'set -euo pipefail; seq 1 100000 | head -1'], { encoding: 'utf-8' });
    if (broken.error) return; // bash is not on this machine, the rule still holds
    expect(broken.status).toBe(141);

    const safe = spawnSync('bash', ['-c', 'set -euo pipefail; seq 1 100000 | sed -n "1p"'], { encoding: 'utf-8' });
    expect(safe.status).toBe(0);
    expect(safe.stdout.trim()).toBe('1');
  });
});
