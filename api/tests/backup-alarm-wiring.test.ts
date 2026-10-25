import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The alarm of a failed backup.
 *
 * A backup that fails has to say so, otherwise the operator finds out days
 * later that there is no copy of the platform. The unit of the backup names
 * the unit of the alarm in its OnFailure, and systemd starts that unit when
 * the backup fails.
 *
 * OnFailure belongs to the section Unit of systemd. When it is written in the
 * section Service, systemd reads it as an unknown key, ignores it, and prints
 * a warning that nobody reads. The alarm of the backup looked wired and was
 * never sent. This test reads the units the way systemd reads them and fails
 * when the alarm cannot be started.
 */

const ROOT = resolve(process.cwd(), "..");
const SYSTEMD = join(ROOT, "scripts", "systemd");
const SCRIPTS = join(ROOT, "scripts");

type Unit = Record<string, Record<string, string[]>>;

/**
 * Reads a unit file the way systemd reads it: a list of sections, and in
 * every section a list of keys with their values. A line that is not a
 * section and not a key is ignored, the same way systemd ignores it.
 */
function parseUnit(text: string): Unit {
  const sections: Unit = {};
  let current = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const section = /^\[(.+)\]$/.exec(line);
    if (section) {
      current = section[1]!;
      sections[current] ??= {};
      continue;
    }
    const key = /^([A-Za-z][A-Za-z0-9]*)=(.*)$/.exec(line);
    if (!key) continue;
    const values = sections[current]?.[key[1]!] ?? [];
    values.push(key[2]!);
    sections[current]![key[1]!] = values;
  }
  return sections;
}

async function readUnit(name: string): Promise<Unit> {
  return parseUnit(await readFile(join(SYSTEMD, name), "utf-8"));
}

describe("the alarm of a failed backup", () => {
  it("is asked for by the unit of the backup", async () => {
    const backup = await readUnit("blipmade-backup.service");

    expect(backup.Unit?.OnFailure).toEqual(["blipmade-backup-alert.service"]);
  });

  it("is not written in the section of the service, where systemd ignores it", async () => {
    const backup = await readUnit("blipmade-backup.service");

    expect(backup.Service?.OnFailure).toBeUndefined();
  });

  it("names units that exist in the repository", async () => {
    const files = await readdir(SYSTEMD);
    const units = new Set(files.filter((file) => file.endsWith(".service")));

    for (const file of files) {
      if (!file.endsWith(".service")) continue;
      const parsed = await readUnit(file);
      for (const target of parsed.Unit?.OnFailure ?? []) {
        expect(units.has(target)).toBe(true);
      }
    }
  });

  it("is sent by the script of the repository, with the environment of the platform", async () => {
    const alert = await readUnit("blipmade-backup-alert.service");
    const backup = await readUnit("blipmade-backup.service");

    expect(alert.Service?.ExecStart).toEqual(["/opt/blipmade/scripts/backup-alert.sh"]);
    expect(alert.Service?.EnvironmentFile).toContain("-/opt/blipmade/.env");
    expect(alert.Service?.WorkingDirectory).toEqual(backup.Service?.WorkingDirectory);
    expect(alert.Service?.User).toEqual(backup.Service?.User);
  });

  it("is sent by a script that systemd can run, with the relay of the platform", async () => {
    const path = join(SCRIPTS, "backup-alert.sh");
    const info = await stat(path);
    const script = await readFile(path, "utf-8");

    expect(info.mode & 0o111).toBeGreaterThan(0);
    expect(script).toContain("SMTP_URL");
    expect(script).toContain("SMTP_CA_FILE");
    expect(script).toContain("nodemailer");
    expect(script).toContain("BACKUP_ALERT_EMAIL");
    expect(script).toContain("platform@blipmade.com");
  });
});
