// Applies auditor A12's corrections to the two copies of the release-gate table:
// gates 4 and 10 move from GREEN to AMBER, with the reason recorded.
// Correction #26, #27 and #35 from 12b-INDEPENDENT-AUDIT.md §8.4.
const fs = require('node:fs');
const base = '/root/blipmade-work/audit/';

const edits = [
  {
    file: '07-release-gates.md',
    from: '| 4 | Upgrade-urile de resurse se fac fără plată corespunzătoare | 🟢 **GREEN** |',
    to: '| 4 | Upgrade-urile de resurse se fac fără plată corespunzătoare | 🟠 **AMBER** |',
  },
  {
    file: '07-release-gates.md',
    from: '| 10 | Checkoutul afișează prețuri material greșite | 🟢 **GREEN** |',
    to: '| 10 | Checkoutul afișează prețuri material greșite | 🟠 **AMBER** |',
  },
  {
    file: '07-release-gates.md',
    from: '**5 RED · 5 AMBER · 3 GREEN.**',
    to: '**5 RED · 7 AMBER · 1 GREEN.**\n\n> **Corectură aplicată după auditul independent** (`12b-INDEPENDENT-AUDIT.md` §8.4, corecturile 26–27). Porțile 4 și 10 erau marcate GREEN, dar fiecare ascundea o constatare P0: `applyUpgradeOrder()` nu verifică plata (`COMM-03`), iar prețul public nu spune unitatea (`PRICE-03`) și totalul afișat nu ajunge la Stripe (`COMM-01`). Verdictul final rămâne **NO-GO** — dar pe baza unei porți verzi mai puține, nu mai multe.',
  },
  {
    file: '07-release-gates.md',
    from: '### Poarta 4 — Upgrade-urile de resurse se fac fără plată corespunzătoare → 🟢 GREEN',
    to: '### Poarta 4 — Upgrade-urile de resurse se fac fără plată corespunzătoare → 🟠 AMBER',
  },
  {
    file: '07-release-gates.md',
    from: '### Poarta 10 — Checkoutul afișează prețuri material greșite → 🟢 GREEN',
    to: '### Poarta 10 — Checkoutul afișează prețuri material greșite → 🟠 AMBER',
  },
  {
    file: '12-FULL-FINDINGS-REGISTER.md',
    from: '| 4 | Upgrade-urile de resurse se fac fără plată corespunzătoare | 🟢 GREEN |',
    to: '| 4 | Upgrade-urile de resurse se fac fără plată corespunzătoare | 🟠 AMBER |',
  },
  {
    file: '12-FULL-FINDINGS-REGISTER.md',
    from: '| 10 | Checkoutul afișează prețuri material greșite | 🟢 GREEN |',
    to: '| 10 | Checkoutul afișează prețuri material greșite | 🟠 AMBER |',
  },
];

for (const e of edits) {
  const p = base + e.file;
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes(e.from)) {
    console.log('MISS  ' + e.file + ' :: ' + e.from.slice(0, 60));
    continue;
  }
  s = s.replace(e.from, e.to);
  fs.writeFileSync(p, s);
  console.log('ok    ' + e.file + ' :: ' + e.from.slice(0, 50));
}
