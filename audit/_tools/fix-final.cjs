// Applies the last corrections from the independent auditor's final pass:
//  - the "close all 28 P0s" claim is 24/28, with PROMO-02 named explicitly
//  - a second instance of the false arithmetic in the register's reconciliation
//  - the gate table needs a retitle, since it now mixes RED and AMBER rows
//  - "orphans 8 and 14" are server IDs, not a count
// From 12b-INDEPENDENT-AUDIT.md §8.2 (final pass).
const fs = require('node:fs');
const base = '/root/blipmade-work/audit/';
let applied = 0;

function apply(file, from, to) {
  const p = base + file;
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes(from)) {
    console.log('MISS ' + file + ' :: ' + from.slice(0, 80));
    return;
  }
  fs.writeFileSync(p, s.replace(from, to));
  applied++;
  console.log('ok   ' + file + ' :: ' + from.slice(0, 60));
}

// 1. The coverage claim: 24 of 28, not all 28.
apply(
  '16-GO-NO-GO-DECISION.md',
  '> **Acoperirea verificată:** cele 19 condiții închid **toate cele 28 de constatări P0** din `12-FULL-FINDINGS-REGISTER.md`, cu excepția celor care sunt **închise prin scenariu** (vezi Scenariul B) sau care privesc **portofoliul**, nu platforma (`PORT-03` — lipsa DDoS, `PORT-06` — 8 servere la 2 vCPU, `PORT-07` — plățile oprite, închis de condiția 1).',
  '> **Acoperirea verificată, condiție cu condiție:** cele 19 condiții închid **24 dintre cele 28 de constatări P0** din `12-FULL-FINDINGS-REGISTER.md`. **Cele 4 neînchise sunt numite aici, ca să nu fie presupuse:** `PROMO-02` (`maxPerUser` nu poate fi setat — **blocant doar pentru campaniile de tip „primii 50 eligibili"; în scenariul B nu există reduceri, deci nu se atinge**); `PORT-03` — jumătatea DDoS a constatării, backup-ul ei e acoperit de condiția 3, dar **protecția DDoS nu e o condiție de lansare, e o decizie de produs și de cost**; `PORT-06` — incapacitatea economică la 2 vCPU, care e **portofoliu**, nu platformă; `PORT-07` — plățile oprite, închise de condiția 1. **Niciuna dintre cele 4 nu e o cale prin care un client pierde banii sau datele.**',
);

apply(
  '16-GO-NO-GO-DECISION.md',
  '> ## ⚠️ **GO condiționat** pentru un **beta privat, cu plată manuală și un număr limitat de clienți**, cu **19 condiții obligatorii**, care închid toate cele 28 de constatări P0 din registru.',
  '> ## ⚠️ **GO condiționat** pentru un **beta privat, cu plată manuală și un număr limitat de clienți**, cu **19 condiții obligatorii**, care închid **24 dintre cele 28** de constatări P0 din registru — cele 4 rămase sunt numite explicit în §4.',
);

// 2. The second instance of the false arithmetic, in the reconciliation section.
apply(
  '12-FULL-FINDINGS-REGISTER.md',
  '**De ce contează:** `discord-bot` la **€1.72** e sub ambele praguri și sub prețul de piață (€0), deci e imposibil de vândut pe acest hardware.',
  '**De ce contează:** `discord-bot` la **€1.72** e sub ambele praguri, deci e imposibil de vândut ca produs principal pe acest hardware. **Atenție la ordine:** pragul de cost e *peste* prețul de intrare al pieței de bot hosting (€0/lună la primul server Lunafy, €1/lună per server suplimentar) — deci **prețul lui nu e sub prețul pieței**, ci **pragul e peste prețul pieței**, ceea ce înseamnă că nu poți concura pe preț cu un concurent cu tier gratuit.',
);

// 3. The gate table now mixes RED and AMBER rows.
apply(
  '16-GO-NO-GO-DECISION.md',
  '## 3. Cele 5 porți RED și ce le declanșează',
  '## 3. Porțile în culoare și ce le declanșează\n\n**5 porți RED** (5, 7, 9, 12, 13) · **7 porți AMBER** (2, 3, 4, 6, 8, 10, 11) · **1 poartă GREEN** (1).',
);

// 4. "Orphans 8 and 14" are server IDs, not a count.
apply(
  '12-FULL-FINDINGS-REGISTER.md',
  '**5 servere pe panou vs 3 instanțe** (orfane **8 și 14**)',
  '**5 servere pe panou vs 3 instanțe** (cele 2 orfane au ID-urile de server **8 și 14**)',
);

fs.writeFileSync(base + '12b-INDEPENDENT-AUDIT.md', fs.readFileSync(base + '12b-INDEPENDENT-AUDIT.md', 'utf8'));
console.log('\napplied ' + applied + '/4 corrections');
