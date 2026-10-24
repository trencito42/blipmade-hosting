# Verdict executiv — Blipmade

**Data:** 2026-10-24 · **Auditat:** `main` @ `e990776` + ramura de reparare `remediation/phase-2-critical-fixes`
**Ce a fost auditat:** întreaga platformă — API, interfață, administrare, facturare, provisionare, infrastructură, recuperare — plus starea reală a producției.
**Cum:** 13 faze, 16 documente obligatorii, 9 agenți de audit independenți, cu dovezi `file:line` și măsurători rulate.

---

## 1. Răspunsul scurt

**Platforma nu poate fi lansată comercială azi.** Nu poate încasa un ban, nu poate servi
un client, nu poate trimite un e-mail, iar pierderea gazdei ar pierde totul.

**Totuși, nu este o respingere a proiectului.** Mecanismele care lipsesc sunt, în cea mai
mare parte, **decizii și cheltuieli ale operatorului** — nu cod ne scris. Șase dintre cele
zece blocaje comerciale identificate de auditul concurențial sunt de acest fel.

Auditul a găsit și o veste proastă, dar utilă: **din 182 de constatări din auditurile
anterioare, 38 sunt verificate ca reparate și 14 parțial reparate.** Codul e într-o stare
mult mai bună decât era acum o lună. Ce nu e gata sunt tastele, imaginile, adresa,
e-mailul și copia de rezervă.

---

## 2. Ce am măsurat, nu ce am citit

Diferența dintre acest audit și o recenzie de cod:

| Măsurătoare | Rezultat |
|---|---|
| Suita de teste pe codul care rulează în producție | **API 325/325, web 87/87** |
| Contractul de preț: preț afișat vs. preț cotat de server | **€2.39 afișat = 239 minor units cotate** — identice |
| Tabele: decalaj antet ↔ corp, cu date populate | **0 px** în 60 de tabele |
| Depășire orizontală | **0 px** în 192 de perechi rută × lățime |
| Drill de restaurare a backupului | a trecut — RTO ≈ **3 s** |
| Backup programat | **instalat și rulat** (era doar fișiere în repo) |
| Cache ratio PostgreSQL | **99,73%** |
| Payload necomprimat pe pagină | **452–558 KB**, din care 347–426 KB JavaScript brut |
| Interogări identice pe pagina de pornire | **6** pentru același catalog |

Auditul a fost **independent în trei locuri**, și asta a schimbat rezultatul:

1. **Patru agenți au lucrat simultan, fără să-și vadă concluziile.**
2. **Lead-ul a reverificat personal șase constatări** și a **refutat două** din rapoarte:
   una căuta după un nume de funcție greșit, alta ignora o numerotare care era deja
   atomică. Ambele ar fi ajuns în sinteză ca „defecte critice" dacă n-ar fi fost verificate.
3. **Faza 13 cere ca agentul care implementează să nu își certifice propriile schimbări.**
   Fiecare reparare are o **dovadă**: testul eșuează fără reparare, trece cu ea.

---

## 3. Cele șase porți

Fiecare poartă are un criteriu de ieșire măsurabil și un proprietar.

| Poartă | Ce trebuie | Cine | Stare |
|---|---|---|---|
| **G1** Un client poate plăti | Chei Stripe live + o comandă reală parcursă până la factură | **Operator** | ⛔ neîndeplinită |
| **G2** Un client poate folosi ce a plătit | Imagine + egg real, adresă publică, rutare | **Operator** | ⛔ neîndeplinită |
| **G3** Un client poate fi contactat | Releu de e-mail care chiar livrează | **Operator** | ⛔ neîndeplinită |
| **G4** Platforma supraviețuiește pierderii gazdei | Copie în afara gazdei + decizia despre RAID | **Operator** | ⛔ neîndeplinită |
| **G5** Hipervizorul este închis | Firewall, parolă rotită, `8006` limitat, `rpcbind` oprit | **Operator** | ⛔ neîndeplinită |
| **G6** Defectele de ban și acces sunt închise și reverificate | Reparările din faza 13 + retest independent | **Dezvoltare** | ⏳ în curs |

**Cinci din șase sunt ale operatorului.** Nu e o critică — e o constatare: dezvoltarea a
construit mecanismele și le-a lăsat, corect, neactivate, pentru că activarea lor cere
chei, imagini și decizii care nu aparțin echipei de cod.

### G1 în detaliu, pentru că e poarta care depinde de cel mai puțin
Cheile Stripe sunt goale, deci **nu s-a încasat niciodată un ban** prin platformă: în
istoria de producție sunt **0 facturi, 0 plăți, 0 abonamente**. Mecanismele sunt însă
acoperite de teste: poarta de plată a provisionării, contractul de preț, promoțiile cu
plafon, numerotarea atomică a comenzilor și facturilor, rambursarea, starea mașinii de
plată. **Trecerea de la „nu se poate" la „se poate" e o cheie și o comandă de probă.**

### G6 în detaliu
În această rundă au apărut constatări noi, serious confirmate, pe care faza 13 le-a
reparat (și le are în retest independent):

- **O comandă anulată sau rambursată putea deveni „plătită"** și primi infrastructură.
  *Reparat.* Dovada: fără reparare, comanda moartă era plătită.
- **O cotare anuală de 1788 € producea o comandă de 149 €.** *Reparat.* Dovada: fără
  reparare, comanda anuală era taxată cu suma lunară. **Suma cotată trebuie să fie suma
  încasată** — aceasta e chiar promisiunea contractului de preț.
- **Un eveniment de plată fără sumă trecea drept „sumă corectă".** *Reparat.*
- Un angajat putea să-și acorde singur 20 din 21 de permisiuni; putea suspenda un
  administrator; exportul complet al fiecărui client anulat era vizibil prin
  interfața de setări. *În reparare acum.*
- Cookie-ul de sesiune era emis **fără `Secure`**, iar limita de autentificare devenise
  **globală** — un atacator putea bloca autentificarea tuturor clienților. *În reparare
  acum.*

---

## 4. Citirea de business

### Ce e pe piață azi
Blipmade nu intră încă pe piața pentru care e dimensionată: **găzduire de servere de joc**.
Catalogul are un produs real (`discord-bot`); `wordpress` e marcat „deployabil" în baza de
date **și nu are imagine**; trei produse nu au nici imagine, nici egg. Auditul concurențial
a notat acest lucru cu o formulă asimetrică față de restul: **nu e o îmbunătățire, e o
intrare pe piață lipsă**.

### Ce are Blipmade și competitorii nu au
Trei lucruri construite în rundele trecute, care **devin vizibile abia după ce se
repară exact lucrurile care lipsesc**:
- **Compensarea** — o provisionare eșuată nu lasă clientul plătind pentru nimic.
- **Prețul pe resursă** — prețul urmărește ce se cere, nu un pachet fix.
- **Disponibilitatea derivată din realitate**, nu dintr-un steag — un produs fără imagine
  nu apare ca vândabil.

Până atunci, e o nichelitate tehnică. După G1–G3, devine singurul activ din setul
competitiv care poate susține un preț de listă **peste** Zentaris și OVINETWORK, pe un
segment unde **prețul nu este pârghia**.

### Ce nu ar trebui construit
Auditul recomandă explicit să **nu** se construiască un motor de facturare complet tip
WHMCS: platforma e mică, iar diferența reală nu e în funcționalitatea de facturare, ci în
**onestitatea stării și în fiabilitatea** — ambele ieftine, niciuna neacoperită de
concurenți.

---

## 5. Riscurile pe care nimeni nu le-a spus până acum

1. **Platforma nu poate răspunde „câte comenzi simultane susține?"** — nu a existat test de
   încărcare autorizat. E o întrebare de risc comercial, nu doar de inginerie.
2. **Interogările panoului de administrare se degradează liniar** — de ×3,1 la ×5,8 între
   o bază de test și una de 5 000 de clienți, din cauza indicilor lipsă și a unui
   sub-interogător executat per rând. La 10 000 de clienți, panoul devine inutilizabil.
3. **`/api/status` durează 4 secunde** și face apeluri seriale spre panou, fiecare cu
   timeout de 20 s. Pe pagina publică de stare, un panou lent împinge răspunsul spre
   **zecile de secunde**.
4. **Nicio limită de resurse pe containere, fără swap** — o singură scurgere de memorie
   poate opri Postgres și, odată cu el, toată platforma.
5. **Oprirea la deploy nu garantează finalizarea cererilor** (`StopTimeout` implicit 10 s).
6. **Nicio interogare lentă nu este înregistrată** (`log_min_duration_statement = -1`):
   nicio optimizare viitoare nu poate fi justificată cu date.

---

## 6. Recomandarea

**Continuați dezvoltarea. Nu lansați.**

Ordinea propusă:

1. **G1 + G2 + G3 împreună.** Cheile Stripe, imaginea și egg-ul produsului vândut,
   `DOMAIN_BASE` + Caddy, releul de e-mail. Fără aceste trei, niciun client nu poate
   plăti și folosi ce a plătit, deci niciun rest nu contează.
2. **G6 în paralel.** Reparările sunt scrise; așteptăm doar retestul independent.
3. **G4 imediat după.** Un backup care nu părăsește gazda nu e un backup. E cea mai
   ieftină decizie din toată lista și cea care protejează tot restul.
4. **G5 imediat după G4.** Firewall **înainte** de rotirea parolei.
5. **Apoi** problemele de performanță de la punctul 5, care sunt toate ieftine și toate
   măsurate.

**Ce nu trebuie făcut:** nu reluați auditul. Cele 182 de constatări au primit verdict,
dovezile sunt în repository, și rămân valabile ca listă de lucru. **Nu vă mai este nevoie
de un audit ca să știu ce e de reparat.**

---

## 7. Ce a fost schimbat efectiv în această sesiune

Pe lângă audit, au fost executate trei lucruri care schimbă starea reală:

1. **Curățarea producției.** Unelte de audit ajunsese să creeze 4 conturi (unul cu rol
   de administrator și o parolă cunoscută), 226 de sesiuni, 13 bilete, 2 comenzi și 3
   instanțe în baza de producție, plus 5 servere pe panoul Pterodactyl. Au fost șterse,
   cu un dump înainte. **Niciun client real nu a fost afectat și nu s-a încasat niciun ban.**
2. **Aplicarea ramurii în producție**, cu migrația `session_last_seen`. Site-ul public
   răspunde 200, toate containerele sunt healthy, iar suita de teste e verde pe codul
   care rulează efectiv.
3. **Programarea backupului, activă.** Timerul există ca fișiere în repository de două
   runde, dar nu era instalat pe gazdă. Acum este instalat, pornit, programat noaptea, și
   o rulare a produs arhiva cu checksum. **Copierea în afara gazdei rămâne de făcut —
   și e motivul pentru care G4 e încă neîndeplinită.**
