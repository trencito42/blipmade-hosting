// Counts the findings register by ID group and severity band, so the summary
// table is derived from the table itself rather than counted by hand.
const fs = require('node:fs');
const path = '/root/blipmade-work/audit/12-FULL-FINDINGS-REGISTER.md';
const text = fs.readFileSync(path, 'utf8');

const GROUPS = [
  ['SEC', 'Securitate'],
  ['PROV', 'Provisionare și produs'],
  ['COMM', 'Comerț și facturare'],
  ['PROMO', 'Promoții'],
  ['DOC', 'Documentație'],
  ['INF', 'Infrastructură'],
  ['NET', 'Rețea și IP'],
  ['CAP', 'Capacitate'],
  ['DR', 'Recuperare la dezastre'],
  ['PRICE', 'Catalog și prețuri'],
  ['OPS', 'Suport și operațiuni'],
  ['PORT', 'Portofoliu și competitivitate'],
  ['MKT', 'Creștere și marketing'],
  ['UX', 'UX și design'],
  ['BE', 'Backend'],
];

const rows = [];
for (const line of text.split('\n')) {
  if (!line.startsWith('|')) continue;
  const cells = line.split('|').slice(1, -1).map((c) => c.trim());
  if (cells.length < 4) continue;
  const m = cells[0].match(/^`?([A-Z]+)-(\d+)`?$/);
  if (!m) continue;
  rows.push({ id: cells[0].replace(/`/g, ''), sev: cells[1], p0: cells.some((c) => /\*\*Da\*\*/.test(c)) });
}

function band(sev) {
  if (/P0/i.test(sev)) return 'P0';
  if (/Critical/i.test(sev)) return 'Critical';
  if (/High/i.test(sev)) return 'High';
  if (/Medium/i.test(sev)) return 'Medium';
  return 'Low/Info';
}

// A row is a blocker when its severity says P0 or when the register flags it
// as a launch blocker. P0 is therefore an exclusive band and the severity
// columns still add up to the number of findings.
const table = [];
const totals = { P0: 0, Critical: 0, High: 0, Medium: 0, 'Low/Info': 0 };
let total = 0;
for (const [prefix, label] of GROUPS) {
  const g = rows.filter((r) => r.id.startsWith(prefix + '-'));
  if (!g.length) continue;
  const c = { P0: 0, Critical: 0, High: 0, Medium: 0, 'Low/Info': 0 };
  for (const r of g) {
    const b = r.p0 ? 'P0' : band(r.sev);
    c[b] += 1;
  }
  total += g.length;
  for (const k of Object.keys(totals)) totals[k] += c[k];
  table.push(`| ${label} (\`${prefix}-*\`) | ${g.length} | ${c.P0} | ${c.Critical} | ${c.High} | ${c.Medium} | ${c['Low/Info']} |`);
}
table.push(`| **Total** | **${total}** | **${totals.P0}** | **${totals.Critical}** | **${totals.High}** | **${totals.Medium}** | **${totals['Low/Info']}** |`);

console.log(table.join('\n'));
console.log('\nrows parsed:', rows.length, '| groups found:', table.length - 1);
console.log('P0 total (from the Da column):', rows.filter((r) => r.p0).length);
