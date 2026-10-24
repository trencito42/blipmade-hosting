# Roadmap de funcționalități lipsă — Blipmade

**Faza:** 10 (matrice de funcționalități lipsă și roadmap), audit post-remediere
**Data:** 23–24 octombrie 2026
**Autor:** agent de audit (rol `Worker`), fără modificări asupra codului sursă
**Stare:** document viu — scris incremental, secțiune cu secțiune

---

## 1. Antet

### 1.1 Ce a stat la baza acestui roadmap

Acest document **nu inventariază** funcționalități. Inventarul există deja și a fost citit integral:

| Document-sursă | Ce am luat din el |
|---|---|
| `FUNCTIONAL-COVERAGE.md` | **Baza.** 934 de linii: 35 rute front-end, 151 endpoint-uri back-end, 30 modele Prisma, 21 permisiuni, 12 taburi de instanță, 14 rânduri de admin, 29 endpoint-uri fără apelant, 34 constatări `FN-P1-*`. Clasele de acoperire (F/B/I/BA/D/S/MP/PW/M) sunt sursa pentru coloana „Stare" |
| `PAYMENTER-FEATURE-PARITY.md` | 19 tabele de paritate pe domenii (D1–D19), 34 constatări `PAR-P1-*`, lista celor 10 gapuri care blochează un GO comercial. Marcajele „prezent / parțial / absent / defect deschis" |
| `COMPETITIVE-GAP-ANALYSIS.md` | Poziționarea față de 9 concurenți (WHMCS, FOSSBilling, Paymenter, Railway, Render, Coolify, Shockbyte/Nodecraft, Aternos, piața RO), segmentarea S1/S2/S3, secțiunea „ce NU ar trebui să construiască" |
| `PREVIOUS-FINDINGS-REVALIDATION.md` | Cele 182 de constatări anterioare, **revalidate**: 38 `VERIFIED FIXED`, 14 `PARTIALLY FIXED`, 80 `STILL BROKEN`, 48 `NOT VERIFIED`, 2 `INVALID`. Verdictele, nu vechiul registru, sunt sursa de adevăr |
| `_raw/LEAD-VERIFICATIONS.md` | A doua opinie a lead-ului: `ADM-01` → **INVALID**, `ADM-02` → încă defect, `DR-02` → reparat **prin acțiune de operator, nu prin cod**, `FIN-P2-01` → **INVALID**, `FIN-P1-01` și `FIN-P2-03` → confirmate |
| `_raw/PRODUCTION-STATE-2026-10-24.md` | Starea reală a producției: variabilele de operator neîndeplinite, catalogul real (doar `discord-bot` este vândabil), prețurile existente, tabelele goale |
| `ADMIN-FUNCTIONALITY.md` | 8 constatări `ADM-P1/P2/P3-*`, secțiunea „Funcții care lipsesc" (5.1 backend fără UI, 5.2 lipsă din ambele) |
| `CUSTOMER-JOURNEYS.md`, `UI-UX-REVIEW.md` | Călătoria clientului și defectele de interfață observate |
| `PERFORMANCE-AND-RELIABILITY.md` | Măsurătorile de latență, bundle, fiabilitate și deciziile de infrastructură |
| `INFRASTRUCTURE-AND-RECOVERY.md` | 23 constatări `INFRA-P1-*`, RTO/RPO măsurate, conținutul real al arhivei de backup |
| `SECURITY-REVIEW.md` | 8 constatări `SEC-P1…P4-*`, inclusiv cookie fără `Secure` și DoS global pe autentificare |
| `FINANCIAL-INTEGRITY.md` | 7 constatări `FIN-P1/P2/P3-*` (două invalidate de lead) |
| `SESSIONS-INVESTIGATION.md` | 14 constatări `SESS-P1-*`, inclusiv regresia `X-Forwarded-For` |

### 1.2 Ce **nu** am putut verifica (limite declarate)

1. **Nu am vizitat `blipmade.com`, `10.77.0.13:3000` sau orice adresă public** al platformei. Nu m-am autentificat niciodată pe site-ul public și nu am creat conturi acolo.
2. **Nu am modificat codul sursă.** Am citit, comparat și planificat. Nu am aplicat niciun patch.
3. **Nu am trunchiat `blipmade_test`** — baza de date a stivei izolate este împărțită cu alți auditori.
4. **Nu am exercitat fluxul real Stripe** — nu există cheie. Doar poarta locală de test (`STRIPE_TEST_MODE=true`) a fost observată, de către alți agenți.
5. **Nu am atins panoul Pterodactyl** cu operații de scriere; prin urmare cele 8 funcții de instanță dependente de panou (`FN-P1-23`) rămân „parțial conectate" și nu „nefuncționale" — diferența contează în matrice.
6. **Nu am rulat suita de teste** a proiectului și nu am cit istoricul git (mirrorul nu conține `.git`).
7. **Nu am făcut măsurători proprii de latență sau de încărcare** — folosesc cifrele deja măsurate de `PERFORMANCE-AND-RELIABILITY.md`, pe care le tratez ca fiind ale altui agent, nu ale mele.

### 1.3 Convenția de marcaj

| Marcaj | Semnificație |
|---|---|
| **LIPSA** | Platforma **nu are** capacitatea. Nu există cod, sau există doar un stub explicit |
| **PARȚIAL** | Capacitatea **există și e legată**, dar nu funcționează complet, sau funcționează doar pe o parte (clasa `PW`/`MP` din `FUNCTIONAL-COVERAGE.md`, sau „parțial" din matricea de paritate) |
| **ANUNȚAT ȘI ABSENT** | Platforma **promite** capacitatea în interfață, în documentație sau în catalog, dar nu o livrează. Cea mai periculoasă dintre cele trei |
| **EXISTĂ ȘI FUNCȚIONEAZĂ** | Nu e un gap. Se raportează separat, în §3.4, ca să nu fie confundat cu o lipsă |

Severitatea (`P0 / Critical / High / Medium / Low-Info`) este **comercială**: cât de mult blochează capacitatea o vânzare sau o operațiune în starea curentă. Efortul (`S / M / L`) este orientativ: `S` ≤ 1 zi, `M` ≤ 1 săptămână, `L` > 1 săptămână **sau** necesită decizie de operator.

---

## 2. Metodă și standardul de dovadă

### 2.1 Regula de trasabilitate

Fiecare rând al matricei poartă **o singură sursă primară** de dovadă — un `file:line` din mirrorul `/root/blipmade-work` sau un ID de constatare dintr-un raport al acestei runde. Nu am creat constatări noi; am **recodificat** constatările existente pe o singură axă (domeniu → lipsă → de ce contează → stare → severitate → efort → dependență → doveză → ordine).

### 2.2 Trei reguli de decizie

1. **O funcție „fără ecran" nu e automat o lipsă.** `FUNCTIONAL-COVERAGE.md` a identificat 29 de endpoint-uri fără apelant în interfață. Dacă backend-ul e complet și funcțional, rândul intră în §3.4 („există și funcționează"), cu o singură excepție: dacă *clientul nu poate ajunge la ea*, atunci e `PARȚIAL`, fiindcă „prezent" înseamnă „utilizabil de un client" (convenția din `PAYMENTER-FEATURE-PARITY.md:501`).
2. **Un defect deschis nu e o funcționalitate lipsă**, dar **înseamnă** că o funcționalitate existentă nu poate fi vândută. Le țin separate în matrice prin coloana „Stare" (`PARȚIAL` pentru defectele care lasă funcția inutilizabilă).
3. **Verdictul lead-ului are prioritate** asupra verdictului agentului atunci când se contrazic. `ADM-01` (verificarea permisiunilor pe bilete) și `FIN-P2-01` (numerotarea facturilor cu `count()+1`) au fost **invalid** de lead și **nu apar** ca rânduri de gap în matrice.

### 2.3 Ce am inclus și ce am exclus din matrice

- **Am inclus**: capacități lipsă din `FUNCTIONAL-COVERAGE.md` (clasele `M`, `S`, `MP`, `PW` și `D` cu efect vizibil), din cele 34 de constatări `PAR-P1-*`, din constatările administrative deschise, din constatările de infrastructură și securitate care au efect asupra vânzării, și din secțiunile „funcții care lipsesc" ale auditului de admin.
- **Am exclus**: constatările **de verificat** (`NOT VERIFIED`) din revalidare — nu putem afirma că o capacitate lipsește dacă n-am putut-o măsura; le-am marcat în nota de sub-capitol, ca limite. Am exclus și constatările **invalide** (două).
- **Nu am inventat** prețuri, termene, angajamente sau funcții care n-au sursă în cele opt rapoarte.

---
