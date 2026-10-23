// Applies auditor A12's corrections to the findings register:
//  - COMM-01 / PROMO-01 are the same defect (correction 11)
//  - PRICE-03 / COMM-09 are the same defect (correction 12)
//  - PORT-02 stated a false arithmetic (correction 14)
//  - PORT-03 carried a verification class that was too strong (correction 43)
//  - PROV-01 phrased its impact beyond its verification class (correction 17)
// From 12b-INDEPENDENT-AUDIT.md §8.2.
const fs = require('node:fs');
const p = '/root/blipmade-work/audit/12-FULL-FINDINGS-REGISTER.md';
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

// PROMO-01 is the same defect as COMM-01.
apply(
  '| PROMO-01 | **P0** | `CODE-INSPECTED` | Reducerea nu ajunge la Stripe ⇒ comanda eșuează la `verifyAmount`, iar clientul ar fi taxat cu prețul neredus | **Da** | `api/src/services/stripe.ts:175` vs `api/src/routes/orders.ts:79` vs `api/src/routes/webhooks.ts:192` |',
  '| PROMO-01 | **P0** | `CODE-INSPECTED` | **Același defect ca `COMM-01`**, văzut din pagina de promoții: reducerea nu ajunge la Stripe ⇒ comanda eșuează la `verifyAmount`, iar clientul ar fi taxat cu prețul neredus. **Nu e o constatare distinctă — se numără o singură dată** | Nu (este `COMM-01`) | vezi `COMM-01`; `api/src/services/stripe.ts:175` vs `api/src/routes/orders.ts:79` vs `api/src/routes/webhooks.ts:192` |',
);

// PRICE-03 and COMM-09 are the same defect.
apply(
  '| PRICE-03 | **P0** | `VERIFIED` | **Prețul afișat public nu spune unitatea** (`price.amount = 149` = €1.49) — convenția apare o singură dată în tot contractul | **Da** | `api/src/routes/catalog.ts:59`; `docs/API_CONTRACT.md` |',
  '| PRICE-03 | **P0** | `VERIFIED` | **Prețul afișat public nu spune unitatea** (`price.amount = 149` = €1.49) — convenția apare o singură dată în tot contractul. **Același defect ca `COMM-09`; se numără o singură dată** | **Da** | `api/src/routes/catalog.ts:59`; `docs/API_CONTRACT.md` |',
);
apply(
  '| COMM-09 | Medium | `CODE-INSPECTED` | Câmpul `price.amount` nu spune că e în unități minori; convenția apare o singură dată în tot contractul | Nu | `api/src/routes/catalog.ts:59`; `docs/API_CONTRACT.md:5,57,60,89` |',
  '| COMM-09 | **P0** (același defect ca `PRICE-03`) | `CODE-INSPECTED` | Câmpul `price.amount` nu spune că e în unități minori; convenția apare o singură dată în tot contractul. **Același defect ca `PRICE-03`; se numără o singură dată** | **Da** | `api/src/routes/catalog.ts:59`; `docs/API_CONTRACT.md:5,57,60,89` |',
);

// PORT-02 stated a false arithmetic: EUR 1.72 is ABOVE EUR 0.
apply(
  '| PORT-02 | **Critical** | `VERIFIED` | **Prețul actual al lui `discord-bot` (€1.72) e sub floor și sub prețul de piață (€0)** ⇒ nu se vinde pe acest hardware, la acest cost, cu acest nivel de suport | **Da** | `08-product-launch-order.md` §7 |',
  '| PORT-02 | **Critical** | `DOCUMENTED-ONLY` + `INFERRED` | **Prețul actual al lui `discord-bot` (€1.72) e sub pragul de acoperire al nodului (€3.40 la 1 vCPU)**. **Atenție la ordine:** pragul de cost e *peste* prețul de intrare al pieței de bot hosting (€0/lună la primul server Lunafy, €1/lună per server suplimentar) — deci **prețul lui NU e sub prețul pieței**, ci **pragul e peste prețul pieței**. Concluzia: botul nu poate fi produsul principal pe acest hardware | **Da** | `08-product-launch-order.md` §7; `08-competitive-analysis.md` §4 |',
);

// PORT-03 carried too strong a class and over-generalised.
apply(
  '| PORT-03 | **Critical** | `VERIFIED` | **Nu există DDoS pe traficul de joc, și nu există backup** — serviciul e cu un pas în urmă față de fiecare concurent românesc și față de Aternos, care e gratuit | **Da** | `08-competitive-analysis.md` — 10 pagini de prețuri citite 2026-10-23 |',
  '| PORT-03 | **Critical** | `VERIFIED` (absența DDoS/backup) + `DOCUMENTED-ONLY` (comparația) + `INFERRED` (concluzia) | **Nu există DDoS pe traficul de joc, și nu există backup** — serviciul e cu un pas în urmă față de **cei 3 furnizori de Minecraft români verificați** în `08-competitive-analysis.md` §2 și față de Aternos, care e gratuit. Nu se generalizează peste furnizorii internaționali, marcați `NOT-VERIFIED` chiar în sursă | **Da** | `08-competitive-analysis.md` — 10 pagini de prețuri citite 2026-10-23 |',
);

// PROV-01 phrased its impact beyond its verification class.
apply(
  'Eroare de 1024×. Discul vândut poate depăși discul nodului; un container care nu-și încape pe disc afectează **tot nodul**, nu doar clientul. Memoria e verificată corect. |',
  'Eroare de 1024×: poarta de capacitate a discului **nu leagă niciodată**. Un disc plin al nodului afectează toate containerele de pe el — impact `INFERRED`; defectul nu poate fi exercitat de un client cât timp plățile sunt oprite. Memoria e verificată corect. |',
);

fs.writeFileSync(p, s);
console.log('\napplied ' + applied + '/6 corrections');
