// Applies auditor A12's corrections 32 and 33 to the go/no-go decision:
// the "not a UX problem" and "not a scaling problem" claims were more
// optimistic than their own sources. From 12b-INDEPENDENT-AUDIT.md §8.4.
const fs = require('node:fs');
const p = '/root/blipmade-work/audit/16-GO-NO-GO-DECISION.md';
const lines = fs.readFileSync(p, 'utf8').split('\n');

const ux = lines.findIndex((l) => l.startsWith('- **Nu e o problemă de UX.**'));
if (ux < 0) throw new Error('UX line not found');
lines[ux] =
  '- **Nu e o cauză de amânare, dar nici o bătaie de curat.** Cele 553 de verificări de browser verzi dovedesc **absența regresiilor**, nu absența defectelor: `06-design-improvement-backlog.md` ratingă **5 elemente S1** — `UX-01` (`DataTable` strică modelul de tabel pe 9 rute, decalaj 105–562 px), `UX-02` (adresa existentă ascunsă în spatele „No public URL yet"), `UX-03` („Online" vs „Container: offline"), `UX-04` (instantă inspecționabilă de staff), `UX-05` (zidul de plată). **Problemele de UX sunt de conținut și de onestitudine, nu de construcție** — și trei dintre cele cinci se repară cu **o singură linie de CSS** sau **o singură clasă**.';

const sc = lines.findIndex((l) => l.startsWith('- **Nu e o problemă de scalare.**'));
if (sc < 0) throw new Error('scaling line not found');
lines[sc] =
  '- **Nu e o problemă de scalare fizică**, dar **este** una de scalare economică: la specificația de piață (2 vCPU), nodul duce 8 servere plătitori = €35.92/lună contra unui cost de nod de €54.44 (`PORT-06`, P0). Capacitatea sigură de 16 instanțe e suficientă **doar** la 1 vCPU.';

fs.writeFileSync(p, lines.join('\n'));
console.log('UX line at', ux + 1, '| scaling line at', sc + 1, '| both rewritten');
