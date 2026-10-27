import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A script must not wait for a process that never ends.
 *
 * The modules of the platform open connections of their own (the database, the
 * cache), so a node program that imports them keeps the event loop alive
 * after the work is done. The program has to end itself, and the call has to
 * be capped in time.
 *
 * The test of the channel of Discord showed what happens without both: the
 * script wrote the address, restarted the services, sent the test message,
 * and then stood still. The message was sent, the answer was on the screen,
 * and the script never came back, because the node program inside the
 * container stayed alive and the shell was waiting for the end of its output.
 * The operator was left in front of a command that looked frozen.
 *
 * The same pattern was in the script of the test instance: the instance was
 * built and the script never came back either.
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

/** One call of node with a program written in the script itself. */
interface NodeCall {
  /** The script, relative to the root of the repository. */
  file: string;
  /** The line where the call is. */
  line: number;
  /** The line where the call is, with the whole statement. */
  statement: string;
  /** The program that node runs. */
  program: string;
}

/**
 * The calls of node with a program between the quotes.
 *
 * The program may be on one line (`node -e "process.exit(0)"`) or on many,
 * between the line of the call and the line that closes the quote.
 */
function nodeCalls(file: string, source: string): NodeCall[] {
  const lines = source.split('\n');
  const calls: NodeCall[] = [];

  lines.forEach((line, index) => {
    const start = line.indexOf('node -e "');
    if (start === -1) return;

    const rest = line.slice(start + 'node -e "'.length);
    if (rest.includes('"')) {
      calls.push({
        file,
        line: index + 1,
        statement: line.trim(),
        program: rest.slice(0, rest.indexOf('"')),
      });
      return;
    }

    const program: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length && !/^\s*"/.test(lines[cursor])) {
      program.push(lines[cursor]);
      cursor += 1;
    }
    calls.push({
      file,
      line: index + 1,
      statement: line.trim(),
      program: program.join('\n'),
    });
  });

  return calls;
}

/** True when the program runs inside the container of the api. */
function runsInTheApiContainer(statement: string): boolean {
  return /exec -T api node -e/.test(statement) || /docker exec blipmade-api-1 node -e/.test(statement);
}

describe('the scripts that run node inside the container', () => {
  it('caps every call in time, so a process that never ends does not hold the script', async () => {
    const files = await shellScripts(SCRIPTS_DIR);
    const offenders: string[] = [];

    for (const path of files) {
      const source = await readFile(path, 'utf8');
      for (const call of nodeCalls(relative(ROOT, path), source)) {
        if (!runsInTheApiContainer(call.statement)) continue;
        if (!/\btimeout\s+\d+/.test(call.statement)) {
          offenders.push(`${call.file}:${call.line} the call is not capped in time`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('ends the process itself when the program opens the modules of the platform', async () => {
    const files = await shellScripts(SCRIPTS_DIR);
    const offenders: string[] = [];

    for (const path of files) {
      const source = await readFile(path, 'utf8');
      for (const call of nodeCalls(relative(ROOT, path), source)) {
        if (!call.program.includes('/app/dist/')) continue;
        if (!call.program.includes('process.exit(')) {
          offenders.push(`${call.file}:${call.line} the program never ends the process`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('the file of the Discord channel', () => {
  const CANONICAL_PATH = '/opt/blipmade/secrets/discord-webhook';

  it('is mounted for the api and for the worker, read only, with the same path inside and outside', async () => {
    const source = await readFile(join(ROOT, 'compose.api.yml'), 'utf8');
    const mounts = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- ') && line.includes('discord-webhook'))
      .map((line) => line.replace(/^- /, '').split(':'));

    // Once for the api, once for the worker.
    expect(mounts.length).toBeGreaterThanOrEqual(2);
    for (const [host, container, mode] of mounts) {
      expect(host).toBe(CANONICAL_PATH);
      expect(container).toBe(host);
      expect(mode).toContain('ro');
    }
  });

  it('is the file that the script of the channel writes in the environment', async () => {
    const script = await readFile(join(ROOT, 'scripts', 'set-discord-webhook.sh'), 'utf8');
    // The directory of the file is the one the compose files mount, and the
    // file has the name the platform expects.
    expect(script).toContain('/opt/blipmade/secrets');
    expect(script).toContain('discord-webhook');
    expect(script).toContain('OPS_DISCORD_WEBHOOK_FILE');
  });
});
