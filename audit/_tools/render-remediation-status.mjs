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
    return `| \`${row.id}\` | ${cell(row.sev)} | ${cell(entry.area)} | ${cell(state)} | ${cell(entry.rootCause)} | ${cell(entry.fix)} | ${cell(entry.commit)} | ${cell(entry.test)} | ${cell(entry.verification)} |`;
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
