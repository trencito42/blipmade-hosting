// Applies auditor A12's corrections to the backlog:
//  - correction 7: the P0 count in the exit criteria (17 vs 23)
//  - correction 16: the false arithmetic in B-79
//  - correction 31: new P0 rows for the three conditions the auditor found missing
// From 12b-INDEPENDENT-AUDIT.md §8.1, §8.2 and §8.4.
const fs = require('node:fs');
const p = '/root/blipmade-work/audit/13-PRIORITIZED-BACKLOG.md';
let s = fs.readFileSync(p, 'utf8');
let applied = 0;

function apply(from, to) {
  if (!s.includes(from)) {
    console.log('MISS :: ' + from.slice(0, 90));
    return;
  }
  s = s.replace(from, to);
  applied++;
  console.log('ok   :: ' + from.slice(0, 70));
}

apply(
  '1. Toate cele **17 rânduri P0** sunt închise și verificate prin criteriul din coloana „Cum se verifică".',
  '1. Toate cele **23 de rânduri P0** din §1 sunt închise și verificate prin criteriul din coloana „Cum se verifică" (acestea acoperă cele 28 de constatări P0 din registru).',
);

// B-79: EUR 1.72 is ABOVE the EUR 0 market entry price; the threshold is above it, not the price below it.
const b79 = s.split('\n').findIndex((l) => l.startsWith('| **B-79** |'));
if (b79 < 0) throw new Error('B-79 not found');
const lines = s.split('\n');
lines[b79] =
  '| **B-79** | `PORT-01` + `PORT-02` + `PORT-06` | **Cardul de preț se recalculează pe baza pragului de acoperire, nu pe baza pieței.** La `C_node ≈ €54.44` (ancoră Contabo VPS 60, `INFERRED` — **operatorul trebuie să o înlocuiască**) pragul e €3.40 la 1 vCPU și €6.81 la 2 vCPU. `discord-bot` la €1.72 e sub pragul de acoperire, iar **pragul** e peste prețul de intrare de pe piață (€0 la Lunafy) — deci nu prețul e sub piața, ci pragul e peste piață | 0,5 z | D-1 | Prețul fiecărui produs e peste pragul lui, la configurația vândută |';
applied++;
console.log('ok   :: B-79 rewritten');

// Three new P0 rows, for the conditions the auditor found missing.
const anchor = '### Unda 3 — Siguranța infrastructurii';
const at = s.indexOf(anchor);
if (at < 0) throw new Error('Unda 3 anchor not found');
const insert = `### 2b. P0 adăugate după auditul independent (A12)

Auditul independent (\`12b-INDEPENDENT-AUDIT.md\` §4.2) a arătat că cele 13 condiții de inversare lăsau deschise **exact cele mai scumpe trei P0 de plată**. Fără aceste trei rânduri, verdictul s-ar inversa spre GO de o platformă care poate taxa un client mai mult decât a cerut și poate acorda un upgrade neplătit.

| # | Constatări | Ce se repară | Efort | Depinde de | Cum se verifică |
|---|---|---|---|---|---|
| **B-90** | \`COMM-01\` (= \`PROMO-01\`) | **Reducerea ajunge la Stripe**: \`unit_amount\` = suma discountuită, iar \`verifyAmount\` compară aceeași sumă | 1,5 z | — | Un checkout cu cod de promoție ajunge la Stripe cu prețul redus, iar \`amount_total\` = \`order.total\` |
| **B-91** | \`COMM-02\` | **Prețul stocat al instanței e prețul configurației**, plus reconcilierea celor 3 instanțe existente (172 / 149 / 172 la aceeași configurație) | 1 z | — | Estimarea lunară din panoul client = prețul de configurare, pentru toate cele 3 instanțe |
| **B-92** | \`COMM-03\` | **\`applyUpgradeOrder()\` refuză o comandă fără plată confirmată** | 0,5 z | — | Un upgrade cu \`order.status != 'PAID'\` e refuzat |

`;
s = s.slice(0, at) + insert + s.slice(at);
applied++;
console.log('ok   :: §2b with B-90..B-92 inserted');

fs.writeFileSync(p, s);
console.log('\napplied ' + applied + ' corrections');
