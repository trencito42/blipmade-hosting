/**
 * Renders the remediation status of the findings into the existing findings
 * register (audit/12-FULL-FINDINGS-REGISTER.md).
 *
 * The register stays the single source of the findings; this script only adds
 * the state of each finding, so a finding is never listed twice and no second
 * register is created.
 *
 * The data lives in audit/_tools/remediation-status.json: one entry per
 * finding, with the fields the implementation brief asks for.
 *
 *   node audit/_tools/render-remediation-status.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REGISTER = path.join(ROOT, '12-FULL-FINDINGS-REGISTER.md');
const DATA = path.join(ROOT, '_tools', 'remediation-status.json');

const START = '<!-- REMEDIATION:START -->';
const END = '<!-- REMEDIATION:END -->';

const STATUSES = [
  'FIXED & VERIFIED',
  'IMPLEMENTED, NOT VERIFIED',
  'BLOCKED: EXTERNAL DEPENDENCY',
  'REQUIRES OPERATOR APPROVAL',
  'NOT APPLICABLE, WITH EVIDENCE',
  'NOT STARTED (BACKLOG)',
  'IN IMPLEMENTATION',
];

/** The findings of the register, with their severity and their text. */
function readFindings() {
  const rows = [];
  for (const line of fs.readFileSync(REGISTER, 'utf8').split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const match = /^`?([A-Z]+-\d+)`?$/.exec(cells[0]);
    if (!match) continue;
    rows.push({
      id: match[1],
      sev: cells[1].replace(/\*\*/g, ''),
      finding: cells[3].replace(/\*\*/g, '').replace(/`/g, ''),
      p0: cells[4],
    });
  }
  const unique = new Map();
  for (const row of rows) if (!unique.has(row.id)) unique.set(row.id, row);
  return [...unique.values()];
}

/** One cell of the table, without the pipe that would break the row. */
function cell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').trim() || '—';
}

function render() {
  const findings = readFindings();
  const status = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const known = new Set(findings.map((row) => row.id));

  /**
   * The second names of a finding.
   *
   * A finding can be seen in more than one report and it can carry more than
   * one identifier. The register lists it once, under one identifier, and the
   * other names point at that identifier. An entry that names another entry
   * with "aliasOf" is a second name and not a finding of its own.
   */
  const aliases = new Map();
  const unknown = [];
  for (const [id, entry] of Object.entries(status)) {
    if (entry && entry.aliasOf) {
      if (!known.has(entry.aliasOf)) {
        unknown.push(`${id} -> ${entry.aliasOf}`);
        continue;
      }
      if (!aliases.has(entry.aliasOf)) aliases.set(entry.aliasOf, []);
      aliases.get(entry.aliasOf).push(id);
      continue;
    }
    if (!known.has(id)) unknown.push(id);
  }

  /**
   * A state that the register does not show is a finding that no one can
   * read. The renderer stops instead of writing a section that hides it, so
   * the register and the state file cannot drift apart without anyone
   * noticing.
   */
  if (unknown.length) {
    console.error('These entries of the state file have no row in the register:');
    for (const id of unknown) console.error(`  ${id}`);
    console.error('Add the row to the register, or name the finding it belongs to with "aliasOf".');
    process.exit(1);
  }

  const counts = new Map();
  for (const row of findings) {
    const state = status[row.id]?.status ?? 'NOT STARTED (BACKLOG)';
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }

  const summary = [
    '| Stare | Constatări |',
    '|---|---:|',
    ...STATUSES.filter((s) => counts.get(s)).map((s) => `| ${s} | ${counts.get(s)} |`),
    `| **Total** | **${findings.length}** |`,
  ].join('\n');

  const rows = findings.map((row) => {
    const entry = status[row.id] ?? {};
    const state = entry.status ?? 'NOT STARTED (BACKLOG)';
    const second = aliases.get(row.id) ?? [];
    const id = [`\`${row.id}\``, ...second.map((name) => `= \`${name}\``)].join(' ');
    return `| ${id} | ${cell(row.sev)} | ${cell(entry.area)} | ${cell(state)} | ${cell(entry.rootCause)} | ${cell(entry.fix)} | ${cell(entry.commit)} | ${cell(entry.test)} | ${cell(entry.verification)} |`;
  });

  const header = [
    '## 11. Starea remedierii',
    '',
    'Secțiunea aceasta este randată de `_tools/render-remediation-status.mjs` din',
    '`_tools/remediation-status.json`. Registrul de mai sus rămâne singura listă a constatărilor; aici',
    'fiecare constatare primește starea ei de remediere, cauza, repararea, commitul, testul și rezultatul',
    'verificării.',
    '',
    'Cele cinci stări cerute de brief sunt stările finale. O constatare la care runda de remediere nu a',
    'ajuns încă păstrează starea `NOT STARTED (BACKLOG)` — nu este o stare de rezolvare, iar numărul ei',
    'arată cât a rămas.',
    '',
    'O constatare văzută în mai multe rapoarte poartă mai multe nume. Ea este listată o singură dată,',
    'sub numele din registru, iar celelalte nume apar lângă el după semnul `=`. Așa apare `ADM-02`',
    'lângă `SEC-04`: nu este o constatare în plus, ci al doilea strat al aceleiași escaladări de privilegii.',
    '',
    summary,
    '',
    '| ID | Sev. | Cod / infrastructură afectată | Stare | Cauza rădăcină | Reparare | Commit | Test de regresie | Verificare |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');

  const text = fs.readFileSync(REGISTER, 'utf8');
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 || end === -1) throw new Error('The markers of the section are missing from the register.');
  const next = `${text.slice(0, start)}${START}\n\n${header}\n${text.slice(end)}`;
  fs.writeFileSync(REGISTER, next);
  console.log(summary);
  console.log('');
  console.log(`findings: ${findings.length}`);
}

render();
