// Rewrites the Q25 answer in the executive summary, after the independent
// audit's corrections: the 19 conditions, the loss-making beta caveat and a
// note on the independent review itself.
const fs = require('node:fs');
const p = '/root/blipmade-work/audit/00-EXECUTIVE-SUMMARY.md';
const lines = fs.readFileSync(p, 'utf8').split('\n');

const start = lines.findIndex((l) => l.startsWith('Aș semna un **beta privat'));
const end = lines.findIndex((l, i) => i > start && l.startsWith('**Observația finală care contează cel mai mult:**'));
if (start < 0 || end < 0) throw new Error('Q25 block not found');

const replacement = [
  'Aș semna un **beta privat, cu plată manuală, maximum 10 clienți**, în trei condiții:',
  '',
  '**Condiția 1 — cele 19 de la `16-GO-NO-GO-DECISION.md` §4, toate îndeplinite și dovedite.** Cele trei care contează cel mai mult: produsul conține o aplicație care rulează, provisionarea e condiționată de plată, și backup-ul e dovedit printr-un drill de restaurare.',
  '',
  '**Condiția 2 — prețul.** Niciun client nu intră la €1.49. Prețul de fundare e negociat manual, în jurul lui **€9.99**, și se aplică **manual**, nu prin codul de promoții.',
  '',
  '**Condiția 3 — beta-ul e declarat ca un cost, nu ca un business.** La 10 clienți și €9.99, rezultatul e **−€19.10/lună** (contribuție €41.90 contra unui cost fix de €61.00). **Beta-ul nu se amortizează, el demonstrează** — și trebuie bugetat ca atare, cu un plafon explicit. Prezentat ca „business care merge", ar fi o minciună; prezentat ca un experiment cu un scop, e corect.',
  '',
  '**Ce aș semna fără ezitare, azi:** waitlistul și comunitatea. Nu costă nimic, nu angajează clienți și nu pune date în producție.',
  '',
  '**Ce nu aș semna în niciun caz:** deschiderea plăților cu `STRIPE_SECRET_KEY` reală înainte de condiția 1. Ar transforma o platformă (onestă) care nu ia bani într-una care ia bani pentru un container gol.',
  '',
];

lines.splice(start, end - start, ...replacement);

// Append the method note after the final observation paragraph.
const lastObs = lines.findIndex((l, i) => i > start && l.startsWith('**Observația finală care contează cel mai mult:**'));
if (lastObs > 0) {
  lines.splice(
    lastObs + 1,
    0,
    '',
    '**O ultimă notă de metodă, pentru că afectează încrederea în cifre:** acest rezumat a fost atacat de un auditor independent (`12b-INDEPENDENT-AUDIT.md`), care a găsit **31 de erori în sinteză**, inclusiv patru critice — contoare greșite, condiții de inversare care lăsau deschise exact cele mai scumpe trei P0 de plată, o eroare aritmetică în prețul recomandat și un rând de porți greșit atribuit. **Toate cele 31 sunt corectate în versiunea de mai sus**, iar condițiile de inversare au crescut de la 13 la 19 tocmai pentru că auditorul a arătat că cele 13 nu erau suficiente.',
  );
}

fs.writeFileSync(p, lines.join('\n'));
console.log('Q25 rewritten at lines', start + 1, '-', end + 1);
