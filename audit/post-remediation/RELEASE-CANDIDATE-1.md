# Release candidate 1 — descrierea pull request-ului

**Ramura:** `integration/release-candidate-1` → **`main`**
**Baza:** `origin/main` la `e990776`
**Link de comparare:** https://github.com/trencito42/blipmade-hosting/compare/main...integration/release-candidate-1
**Deschiderea PR-ului:** https://github.com/trencito42/blipmade-hosting/pull/new/integration/release-candidate-1
**Rularea CI pe vârful ramurii:** https://github.com/trencito42/blipmade-hosting/actions/runs/40112290601

> `gh` și un token GitHub nu există în acest mediu, deci PR-ul nu poate fi
> deschis programatic. Ramura e deja pushată; e nevoie de un click.

---

## 1. Ce aduce ramura

Cinci valuri de lucru, toate într-o singură ramură, în ordinea în care au fost
făcute:

1. **Fazele 1–12 — siguranța plății.** O comandă moartă nu mai poate deveni
   plătită, suma plătită e verificată, rambursările sunt păstrate, un membru
   al personalului nu mai acționează pe contul unui administrator, adresa
   clientului e citită din dreapta lanțului `X-Forwarded-For`, limita de
   autentificare numără doar eșecurile.
2. **Faza 13 — garda de permisiuni.** Un angajat nu mai acordă o permisiune
   pe care nu o are și nu își modifică propria listă.
3. **Fazele 14–16 — retestul reparărilor.** Trei găuri găsite de retest:
   rambursarea sumei, contul propriu, pagina de ordine moartă, plus
   `deploy/edge/Caddyfile`.
4. **Lotul de performanță (8 commituri).** Compresie la construire, vendor
   React separat, tab-uri leneșe, o redimensionare de la 4 928 la 22 desene,
   timeout-uri și oprire grațioasă, `/health/live` + `/health/ready`, metrici
   Prometheus pe un listener cu cheie, dead-letter pentru joburile eșuate,
   paginare cu cursor și șase indexuri compuse, limite și rotație de loguri
   pe toate containerele, CLS 0 pe paginile publice.
5. **Verificarea independentă și reparările ei.** Un agent care nu a scris
   codul a verificat P0/P1. A găsit 11 constatări noi; 5 sunt reparate aici,
   cu teste care pică pe codul de dinaintea reparației.
6. **Repararea CI-ului.** Fișierul workflow-ului era invalid și GitHub nu a
   creat niciun job la nicio împingere, de când a fost adăugat. După
   reparare, cele șase joburi rulează și trec.

## 2. Ce s-a reparat în acest candidat

| Commit | Defect | Test de regresie |
|---|---|---|
| `5bdc92b` | **P0** — un client care a plătit o dată nu putea plăti a doua oară: `Payment.stripeCustomerId` era unic, deci a doua plată era respinsă de baza de date, comanda rămânea `PAID` și serviciul nu era livrat. Banii se luau, serviciul nu venea. | `api/tests/payment-second-purchase.test.ts` — fără reparare: `HTTP 500` + `Unique constraint failed on the fields: (stripeCustomerId)` |
| `b00ffa4` | **P1** — confirmarea unei colectări făcute în afara platformei nu avea garda de cont: un staff cu `orders.write` putea confirma factura unui administrator și îi prelungea gratuit perioada serviciului | `api/tests/phase2-invoice-collection.test.ts` — fără reparare: `HTTP 200` în loc de `403` |
| `14f7a5f` | Rambursarea unei plăți sosite pentru o comandă moartă returna suma comenzii, nu suma primită | `api/tests/webhooks.test.ts` |
| `14f7a5f` | Tabelul `DeadLetterJob` nu era golit între fișierele de test | `api/tests/perf-data-dead-letter.test.ts` |
| `14f7a5f` | Comentariul din `web/server.mjs` spunea că lanțul se citește din stânga, iar codul îl citește din dreapta | `web/tests/client-address.test.mjs` |
| `4ea98ee` | Schema nu declara default-ul pe care migrarea îl creează deja în producție (`MailDelivery.updatedAt`, `PanelCredential.updatedAt`) — jobul CI `schema-drift` era roșu | `prisma migrate diff --exit-code` → `No difference detected` |
| `e35e575`, `0f05ace` | Suita de teste lua coada workerului de producție: primea acum baza 1 de Redis, iar indicele e alegibil cu `TEST_REDIS_DB` | — |
| `1e01fba` | O constatare reparată era invizibilă în registrul unic: intrarea `ADM-02` din fișierul de stare nu avea rând în registru și nu era randată niciodată. Randatorul se oprește acum cu o eroare când o intrare nu are rând | `audit/_tools/render-remediation-status.mjs` |
| `667dbb2` | Scanarea de secrete raporta cinci valori, dintre care una e o parolă moartă dintr-un script eliminat. Lista de excepții e acum în `.gitleaks.toml`, cu fiecare valoare numită exact | `gitleaks 8.24.3` pe întreaga istorie: 0 scurgeri |
| `6272785` | **CI** — fișierul workflow-ului era invalid: `runner.temp` în mediul unui job, unde contextul `runner` nu există. GitHub crea rularea, refuza să creeze joburile și o marca eșuată — 49 de rulări, niciun job | `actionlint` raportează aceeași eroare ca GitHub pe fișierul de dinainte și nimic pe cel de după |
| `264edf4` | **CI** — jobul de teste nu avea adresa panoului și tokenul intern, deci suita pica pe runner cu 10 erori, toate de mediu | rularea completă a suitei într-o copie a arborelui, cu mediul jobului și nimic altceva: 465/465 |
| `9734b9b` | **13 colecții din corpul cererii fără limită** (8 tablouri, 5 dicționare) — expunerea la advisory-ul de `zod` | `api/tests/collection-bounds.test.ts` — fără reparare: 4 picate; cu repararea: 5 verzi |
| `4fcf66f` | Advisory-ul `zod` acceptat temporar, ca celelalte douăsprezece, cu urmărirea în registru ca `SEC-31` | jobul CI `dependency-audit` e verde |

## 3. Ce a fost măsurat

Verificarea completă a fost rulată pe vârful ramurii, pe o stivă izolată, cu
baza de test, baza de Redis și porturi proprii. Producția nu a fost atinsă.

| Verificare | Rezultat |
|---|---|
| `tsc -p tsconfig.json --noEmit` (API) | curat |
| `tsc -p tsconfig.test.json --noEmit` (teste) | curat |
| `tsc --noEmit` (web) | curat |
| `npx vite build` | reușit, 50 de fișiere comprimate (810 kB → 242 kB gzip, 209 kB brotli) |
| `bash scripts/run-tests.sh` (API + web) | **API 52 fișiere / 465 teste verzi**; web **109/109** |
| `prisma migrate diff --exit-code` | `No difference detected` (era `exit 2` pe `main` și pe candidat înainte de `4ea98ee`) |
| `npm audit --audit-level=high` (api + web) | verde — advisory-ul `zod` e pe lista acceptată (`SEC-31`) |
| `gitleaks 8.24.3` pe întreaga istorie | 0 scurgeri, cu lista de excepții |
| E2E în browser (15 rute, client + admin) | toate `HTTP 200`, tabelele aliniate, autentificarea merge |
| `/health/live`, `/health/ready` | `200` / `200` |
| Listenerul de metrici | `401` fără cheie, `200` cu cheia |

### Cele șase joburi ale CI-ului, pe rularea reală

Rularea: **https://github.com/trencito42/blipmade-hosting/actions/runs/40112290601**

| Job | Rezultat |
|---|---|
| API typecheck | ✅ |
| Web typecheck and build | ✅ |
| Unit and integration tests | ✅ |
| Secret scan | ✅ |
| Dependency audit | ✅ |
| Schema drift | ✅ |

## 4. Ce **nu** face acest PR

- **Nu face merge în `main`.** Ramura e pregătită și verificată; fuziunea e
  decizia operatorului.
- **Nu face deploy în producție.** Containerele de producție rulează încă
  codul `fdd19d8`; datele nu au fost atinse.
- **Nu șterge nicio ramură și nu rescrie istoricul.** Toate ramurile
  vechi rămân pe server.
- **Nu conectează providerul de plăți.** `STRIPE_SECRET_KEY` e gol, deci
  migrarea `20261025160000_payment_customer_index` trebuie aplicată **înainte**
  de conectarea lui — altfel a doua plată a fiecărui client eșuează.

## 5. Decizii luate

**Advisory-ul `zod` (`GHSA-mrhx-c7xc-m3w5`, high) — acceptat temporar** (`4fcf66f`).
Era deja raportat pe `main`, cu aceeași versiune de `zod` (3.25.76), deci nu e
regresie a ramurii. Corecția oficială e `zod` 4.6.7, o actualizare semver-major
care schimbă validarea fiecărei rute și forma erorii `ZodError` — o schimbare
cu testele ei, nu ceva de făcut în ultimul minut al unui candidat de lansare.
Advisory-ul e pe lista acceptată din `.github/workflows/ci.yml`, ca celelalte
douăsprezece, iar urmărirea e în registru, ca `SEC-31`. **Expunerea a fost
micșorată fără actualizarea majoră**, prin limitarea celor 13 colecții ale
corpului cererii (`9734b9b`, `SEC-32`).

## 6. Ce are nevoie de decizia operatorului

1. **Curățarea istoricului de parola moartă** (`SEC-30`). Valoarea e scoasă
   din sursă în `61111f6` și niciun cont al platformei nu o folosește
   (3 utilizatori în baza vie, 0 potriviri), dar istoricul o păstrează.
   Curățarea cere force-push.
2. **Reconfigurarea edge-ului `10.77.0.12`** (`NET-05`). Până când edge-ul
   rescrie `X-Forwarded-For`, contorul de rată grupează după adresa
   edge-ului. `deploy/edge/Caddyfile` e pregătit; limita pe cont rămâne
   intactă, deci forța brută a parolei nu e ocolită.
3. **Pager sau plafon pentru listele de client** (`PERF-P2-03`).
4. **Deciziile din `audit/25-OPERATOR-DEPENDENCIES.md`**: chei Stripe live,
   `SMTP_URL`, `OFFSITE_TARGET`+`OFFSITE_KEY`+`rclone`, `DOMAIN_BASE`+
   `CADDY_ADMIN_*`, RAID, firewall pe Proxmox înainte de rotirea parolei de
   `root`, valoarea `C_node`, regimul TVA, confirmarea contului
   `steph@ripboyband.com`.
5. **Cum se împiedică recurența.** Workflow-ul e validat acum cu `actionlint`,
   dar în afară de verificarea manuală. Un pas de lint în CI ar prinde orice
   expresie pusă într-un context care nu o are.

## 7. Migrațiile care se aplică la deploy

```
20261025120000_dead_letter_jobs
20261025140000_list_page_indexes
20261025160000_payment_customer_index
```

Prima creează tabela joburilor eșuate, a doua recrează patru indexuri
existenți, a treia renunță la constrangerea unică pe `Payment.stripeCustomerId`.
Toate sunt aditive; a doua e singura care face `DROP INDEX` pe indexuri
existenți, deci indexul trebuie verificat după aplicare.

## 8. Documentele

- `audit/12-FULL-FINDINGS-REGISTER.md` — registrul unic, 197 de constatări
- `audit/post-remediation/GO-NO-GO-VERDICT.md` — verdictul de lansare
- `audit/post-remediation/PERFORMANCE-ENGINEERING-REPORT.md` — raportul
  performanței, cu măsurătorile
- `audit/25-OPERATOR-DEPENDENCIES.md` — ce depinde de operator
- `audit/_tools/remediation-status.json` — starea fiecărei constatări
