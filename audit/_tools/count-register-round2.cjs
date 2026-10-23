// Counts the findings of the second round by ID group and severity band, so
// the summary table is derived from the table itself rather than counted by
// hand.
//
// The columns of the register are fixed:
//   0 ID | 1 severity | 2 symptom | 3 class | 4 state | 5 P0 | 6 evidence
// The state and the P0 marker are read from their own column, because an ID
// such as `DASH-01` contains the letters of "Da" and would otherwise be
// counted as a repaired finding.
const fs = require('node:fs');
const path = '/root/blipmade-work/audit/23-ROUND2-FINDINGS-REGISTER.md';
const text = fs.readFileSync(path, 'utf8');

const GROUPS = [
  ['AVAIL', 'Disponibilitatea produsului'],
  ['PRICE', 'Contractul de preț'],
  ['TBL', 'Tabelele de date'],
  ['DASH', 'Panoul clientului'],
  ['PLP', 'Ciclul de viață al prețului'],
  ['PAY', 'Plățile și comanda'],
  ['SESS', 'Sesiunile și contul'],
  ['CONS', 'Consistența vizuală'],
  ['ADM', 'Interfața de administrare'],
  ['NAV', 'Navigare și stări goale'],
];

const rows = [];
for (const line of text.split('\n')) {
  if (!line.startsWith('|')) continue;
  const cells = line.split('|').slice(1, -1).map((c) => c.trim());
  if (cells.length < 7) continue;
  const m = cells[0].match(/^`?([A-Z]+)-(\d+)`?$/);
  if (!m) continue;
  rows.push({
    id: cells[0].replace(/`/g, ''),
    sev: cells[1],
    state: cells[4].replace(/[`*]/g, ''),
    p0: cells[5].replace(/[`*]/g, '').toLowerCase() === 'da',
  });
}

function band(sev) {
  if (/P0/i.test(sev)) return 'P0';
  if (/Critical/i.test(sev)) return 'Critical';
  if (/High/i.test(sev)) return 'High';
  if (/Medium/i.test(sev)) return 'Medium';
  return 'Low/Info';
}

const table = [];
const totals = { P0: 0, Critical: 0, High: 0, Medium: 0, 'Low/Info': 0 };
let total = 0;
let fixed = 0;
let partial = 0;
for (const [prefix, label] of GROUPS) {
  const g = rows.filter((r) => r.id.startsWith(prefix + '-'));
  if (!g.length) continue;
  const c = { P0: 0, Critical: 0, High: 0, Medium: 0, 'Low/Info': 0 };
  for (const r of g) {
    const b = r.p0 ? 'P0' : band(r.sev);
    c[b] += 1;
    if (r.state.toLowerCase() === 'da') fixed += 1;
    else if (r.state.toLowerCase().startsWith('par')) partial += 1;
  }
  total += g.length;
  for (const k of Object.keys(totals)) totals[k] += c[k];
  table.push(`| ${label} (\`${prefix}-*\`) | ${g.length} | ${c.P0} | ${c.Critical} | ${c.High} | ${c.Medium} | ${c['Low/Info']} |`);
}

const summary = [
  '| Grup | Constatări | P0 | Critical | High | Medium | Low/Info |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...table,
  `| **Total** | **${total}** | **${totals.P0}** | **${totals.Critical}** | **${totals.High}** | **${totals.Medium}** | **${totals['Low/Info']}** |`,
].join('\n');

console.log(summary);
console.log('');
console.log(`reparate:    ${fixed} din ${total}`);
console.log(`partiale:   ${partial}`);
console.log(`ramase:     ${total - fixed - partial}`);
