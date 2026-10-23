// Final consistency check over the audit corpus.
// Run: node _tools/final-check.cjs
const fs = require('node:fs');
const path = require('node:path');

const base = '/root/blipmade-work/audit/';
const files = fs.readdirSync(base).filter((f) => f.endsWith('.md') || f.endsWith('.csv'));
let fail = 0;
const failNote = (m) => {
  fail++;
  console.log('  FAIL  ' + m);
};
const passNote = (m) => console.log('  ok    ' + m);

console.log('\n=== 1. Deliverables required by the brief ===');
const required = [
  '00-BRIEFING.md', '00-EXECUTIVE-SUMMARY.md', '00-architecture.md', '00-current-state.md',
  '00-documentation-drift.md', '00-project-inventory.md', '01-backend-audit.md',
  '02-security-audit.md', '03-capacity-model.md', '03-disaster-recovery.md', '03-infrastructure.md',
  '03-network-and-ip-plan.md', '04-product-certification.md', '04-pterodactyl-and-provisioning.md',
  '05-commerce-and-billing.md', '05-pricing-consistency.md', '05-promotions.md',
  '06-customer-journeys.md', '06-design-improvement-backlog.md', '06-design-system.md',
  '06-route-matrix.md', '06-ux-ui-complete.md', '07-quality-assurance.md', '07-release-gates.md',
  '08-competitive-analysis.md', '08-product-launch-order.md', '08-product-portfolio.md',
  '09-break-even-model.csv', '09-capacity-and-revenue.md', '09-financial-assumptions.md',
  '09-pricing-recommendations.md', '09-unit-economics.md',
  '10-growth-metrics.md', '10-launch-campaigns.md', '10-launch-copy.md', '10-marketing-strategy.md',
  '10-positioning.md', '10-seo.md',
  '11-compliance-checklist.md', '11-onboarding.md', '11-support-and-operations.md',
  '12-FULL-FINDINGS-REGISTER.md', '12b-INDEPENDENT-AUDIT.md',
  '13-PRIORITIZED-BACKLOG.md', '14-30-60-90-DAY-ROADMAP.md',
  '15-PRODUCTION-LAUNCH-CHECKLIST.md', '16-GO-NO-GO-DECISION.md', '17-NEXT-IMPLEMENTATION-PROMPT.md',
];
const present = new Set(files);
const missing = required.filter((f) => !present.has(f));
if (missing.length) failNote('missing deliverables: ' + missing.join(', '));
else passNote(required.length + ' required deliverables present');

console.log('\n=== 2. Secrets ===');
const secretRe = /(sk_live_[A-Za-z0-9]{10,}|sk_test_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|ptlc_(?!0123456789abcdef)[A-Za-z0-9]{10,}|ptla_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{25,}|Bearer\s+[A-Za-z0-9._-]{25,}|-----BEGIN [A-Z ]*PRIVATE KEY|postgres:\/\/user:pass@)/g;
let secretHits = 0;
for (const f of files) {
  const s = fs.readFileSync(base + f, 'utf8');
  const m = s.match(secretRe);
  if (m) {
    secretHits += m.length;
    failNote(f + ': ' + m.length + ' secret-like literal(s): ' + m[0].slice(0, 40));
  }
}
if (!secretHits) passNote('no secret literals');

const pwdHits = files.filter((f) => /QaHeadless!2026|BrowserCheck2026/.test(fs.readFileSync(base + f, 'utf8')));
if (pwdHits.length) failNote('test account password still present in: ' + pwdHits.join(', '));
else passNote('no test account passwords');

console.log('\n=== 3. Minor units rendered as euros ===');
const euroRe = /\b(149|172|262|299|449|452|592|976)\s*(EUR\b|EUR\/|EUR per|EUR pe)/g;
let euroHits = 0;
for (const f of files) {
  const s = fs.readFileSync(base + f, 'utf8');
  for (const line of s.split('\n')) {
    if (/unități minori|minor units/.test(line)) continue;
    if (/Corectură pentru ceilalți agenți|Corectare necesară|nu există, și în sistem|greșit de 100×|era „172 EUR"|era „172 EUR”|copia brută a rândurilor/.test(line)) continue;
    // The raw database dump in the commerce report: the amount column is in
    // minor units and the block is annotated as such right below it.
    if (/^\s*cmv[a-z0-9]{10,}\s+\d+\s+\d+\s+\d+\s+\d+\s+EUR/.test(line)) continue;
    const m = line.match(euroRe);
    if (m) {
      euroHits++;
      failNote(f + ': "' + m[0] + '" — ' + line.trim().slice(0, 90));
    }
  }
}
if (!euroHits) passNote('no minor-unit amount labelled as EUR');

console.log('\n=== 4. Register counters match the register body ===');
{
  const s = fs.readFileSync(base + '12-FULL-FINDINGS-REGISTER.md', 'utf8');
  const rows = [];
  for (const line of s.split('\n')) {
    if (!line.startsWith('|')) continue;
    const c = line.split('|').slice(1, -1).map((x) => x.trim());
    if (c.length < 4) continue;
    if (!/^`?[A-Z]+-\d+`?$/.test(c[0])) continue;
    rows.push({ sev: c[1], p0: c.some((x) => /\*\*Da\*\*/.test(x)) });
  }
  const band = (r) => (r.p0 ? 'P0' : /P0/i.test(r.sev) ? 'P0' : /Critical/i.test(r.sev) ? 'Critical' : /High/i.test(r.sev) ? 'High' : /Medium/i.test(r.sev) ? 'Medium' : 'Low/Info');
  const counts = {};
  for (const r of rows) counts[band(r)] = (counts[band(r)] || 0) + 1;
  const claimed = s.match(/\*\*Total\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\*/);
  if (!claimed) failNote('total row not found in the register');
  else {
    const [, tot, p0, crit, high, med, low] = claimed.map(Number);
    const actual = { tot: rows.length, p0: counts.P0 || 0, crit: counts.Critical || 0, high: counts.High || 0, med: counts.Medium || 0, low: counts['Low/Info'] || 0 };
    const ok = actual.tot === tot && actual.p0 === p0 && actual.crit === crit && actual.high === high && actual.med === med && actual.low === low;
    if (!ok) failNote(`claimed ${tot}/${p0}/${crit}/${high}/${med}/${low} vs actual ${actual.tot}/${actual.p0}/${actual.crit}/${actual.high}/${actual.med}/${actual.low}`);
    else passNote(`register counters verified: ${tot} findings, ${p0} P0`);
    const sum = p0 + crit + high + med + low;
    if (sum !== tot) failNote(`severity bands sum to ${sum}, not ${tot}`);
    else passNote('severity bands are exclusive and sum to the total');
  }
}

console.log('\n=== 5. The 25 executive questions are answered ===');
{
  const s = fs.readFileSync(base + '00-EXECUTIVE-SUMMARY.md', 'utf8');
  const missing = [];
  for (let i = 1; i <= 25; i++) {
    if (!new RegExp(`^## ${i}\\. `, 'm').test(s)) missing.push(i);
  }
  if (missing.length) failNote('questions without a heading: ' + missing.join(', '));
  else passNote('all 25 questions have a numbered answer');
}

console.log('\n=== 6. The independent audit corrections are applied ===');
{
  const checks = [
    ['16-GO-NO-GO-DECISION.md', 'Cele 19 condiții care inversează verdictul', '19 conditions in the go/no-go'],
    ['16-GO-NO-GO-DECISION.md', '24 dintre cele 28', 'coverage stated as 24 of 28'],
    ['16-GO-NO-GO-DECISION.md', '**14** | **Reducerea ajunge la Stripe**', 'condition 14 closes COMM-01'],
    ['16-GO-NO-GO-DECISION.md', '**15** | **Prețul stocat al instanței', 'condition 15 closes COMM-02'],
    ['16-GO-NO-GO-DECISION.md', '**16** | **`applyUpgradeOrder()` refuză', 'condition 16 closes COMM-03'],
    ['12-FULL-FINDINGS-REGISTER.md', 'Același defect ca `COMM-01`', 'PROMO-01 deduped'],
    ['12-FULL-FINDINGS-REGISTER.md', 'Același defect ca `PRICE-03`', 'PRICE-03 / COMM-09 deduped'],
    ['12-FULL-FINDINGS-REGISTER.md', 'pragul de cost e *peste* prețul de intrare', 'PORT-02 arithmetic fixed'],
    ['14-30-60-90-DAY-ROADMAP.md', 'Registrul de riscuri comerciale', 'Q24 risk register present'],
    ['09-unit-economics.md', '| 4.50 | 5.6350', 'unit economics row 4.50 fixed'],
    ['09-unit-economics.md', '**209.52** | 8.38', 'LTV at 2% churn fixed'],
    ['09-unit-economics.md', '61.00 / 16 = 3.8125', 'fixed cost allocation fixed'],
    ['09-pricing-recommendations.md', '**EXISTĂ**', 'pricing recommendations re-mapped'],
    ['01-backend-audit.md', 'BE-01', 'backend audit exists with findings'],
  ];
  for (const [f, needle, label] of checks) {
    const p = base + f;
    if (!fs.existsSync(p)) {
      failNote(label + ' — file missing: ' + f);
      continue;
    }
    if (fs.readFileSync(p, 'utf8').includes(needle)) passNote(label);
    else failNote(label + ' — "' + needle + '" not found in ' + f);
  }
}

console.log('\n=== 7. Cross-document counters ===');
{
  const pairs = [
    ['12-FULL-FINDINGS-REGISTER.md', '| **Total** | **182**', 'register'],
    ['16-GO-NO-GO-DECISION.md', '182 constatări, 28 P0', 'go/no-go'],
    ['00-EXECUTIVE-SUMMARY.md', '182 de constatări clasificate', 'executive summary'],
    ['13-PRIORITIZED-BACKLOG.md', '182 constatări, 28 P0', 'backlog'],
  ];
  for (const [f, needle, label] of pairs) {
    const p = base + f;
    if (!fs.existsSync(p)) { failNote(label + ' — file missing'); continue; }
    if (fs.readFileSync(p, 'utf8').includes(needle)) passNote(label + ': ' + needle);
    else failNote(label + ' — "' + needle + '" not found');
  }
}

console.log('\n' + (fail ? '*** ' + fail + ' CHECK(S) FAILED ***' : '*** ALL CHECKS PASSED ***'));
console.log('corpus: ' + files.length + ' files\n');
process.exit(fail ? 1 : 0);
