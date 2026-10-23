# 23 — Registrul constatărilor rundei a doua

**Data:** 2026-10-23.
**Natura:** a doua rundă de audit **cu implementare** pe panoul clientului și pe interfața de administrare
a platformei Blipmade (`trencito42/blipmade-hosting`, producție la `blipmade.com`).
**Cum se citește:** fiecare rând este o constatare cu o clasă de verificare, o severitate, starea în
care a ajuns în această rundă și doveza. Rândurile trimit la raportul-sursă, unde se află dovada
completă cu `file:line` sau cu ieșirea comenzii.

**Starea unei constatări:**

| Stare | Semnificație |
|---|---|
| `Da` | Reparată în cod în această rundă și verificată. |
| `Parțial` | Reparată în cod, dar mai rămâne ceva: de regulă o decizie de date sau un deploy. |
| `Nu` | Neacoperită în această rundă; rămâne deschisă, cu motivul în raportul-sursă. |

---

## 0. Metoda, clasele și convenția de identificare

### 0.1 Clasele de verificare

| Clasă | Semnificație |
|---|---|
| `VERIFIED` | Măsurat direct în sistemul care rulează. |
| `CODE-INSPECTED` | Citit în codul sursă; comportamentul nu a fost executat. |
| `INFERRED` | Concluzie logică din dovezi, fără măsurare directă. |
| `UNVERIFIED` | Nu s-a putut verifica din acest mediu; motivul e dat în raportul-sursă. |
| `NOT-IMPLEMENTED` | Funcția nu există în cod. |

### 0.2 Severitățile

| Severitate | Test |
|---|---|
| **P0 — Blocant** | Fără reparare, plata reală nu poate fi acceptată în condiții sigure. |
| **Critical** | Pierdere de date, de plată, de control sau de conformitate. |
| **High** | Cădere de funcție la o acțiune realistă a clientului. |
| **Medium** | Defect cu impact real, dar cu circumstanțe de declanșare mai rare. |
| **Low / Info** | Igienă, consistență, documentare. |

### 0.3 Rapoartele-sursă

| Raport | Subiect | Constatări |
|---|---|---|
| `18-customer-dashboard-audit.md` | Panoul clientului | `DASH-01`–`DASH-11` |
| `19-pricing-lifecycle-audit.md` | Ciclul de viață al prețului | `PLP-01`–`PLP-09` |
| `20-sessions-and-account-security.md` | Sesiunile și contul | `SESS-01`–`SESS-08` |
| `21-visual-consistency-contract.md` | Consistenta vizuală | `CONS-01`–`CONS-06` |
| `22-admin-interface-audit.md` | Interfața de administrare | `ADM-01`–`ADM-16` |
| constatări proprii ale rundei | modelul de disponibilitate, contractul de preț, tabelele, plățile, stările goale | `AVAIL-*`, `PRICE-*`, `TBL-*`, `PAY-*`, `NAV-*` |

### 0.4 Contoare

Contoarele de mai jos sunt **calculate din tabelele acestui document** (scriptul
`_tools/count-register-round2.cjs`), nu numărate cu mâna.

| Grup | Constatări | P0 | Critical | High | Medium | Low/Info |
|---|---:|---:|---:|---:|---:|---:|
| Disponibilitatea produsului (`AVAIL-*`) | 2 | 1 | 0 | 0 | 1 | 0 |
| Contractul de preț (`PRICE-*`) | 4 | 1 | 0 | 2 | 1 | 0 |
| Tabelele de date (`TBL-*`) | 4 | 0 | 0 | 2 | 2 | 0 |
| Panoul clientului (`DASH-*`) | 11 | 0 | 0 | 1 | 7 | 3 |
| Ciclul de viață al prețului (`PLP-*`) | 9 | 1 | 0 | 2 | 2 | 4 |
| Plățile și comanda (`PAY-*`) | 3 | 0 | 0 | 1 | 2 | 0 |
| Sesiunile și contul (`SESS-*`) | 8 | 0 | 0 | 2 | 4 | 2 |
| Consistența vizuală (`CONS-*`) | 6 | 0 | 0 | 1 | 4 | 1 |
| Interfața de administrare (`ADM-*`) | 16 | 0 | 2 | 4 | 7 | 3 |
| Navigare și stări goale (`NAV-*`) | 2 | 0 | 0 | 0 | 2 | 0 |
| **Total** | **65** | **3** | **2** | **15** | **32** | **13** |

reparate:    44 din 65
partiale:   9
ramase:     12

---

## 1. Disponibilitatea produsului (`AVAIL-*`)

| ID | Severitate | Simptom | Clasă | Stare | P0 | Dovadă |
|---|---|---|---|---|---|---|
| `AVAIL-01` | P0 | `deployable` era un flag liber: un produs putea fi taxat și plătit fără mapping de egg pe panou, iar provisionarea eșua la pasul `server_created` | `VERIFIED` | Da | **Da** | `api/src/services/availability.ts`; `api/src/routes/admin.ts` (garda pe egg) |
| `AVAIL-02` | Medium | Catalogul nu trimitea nicio stare de disponibilitate, deci fiecare interfață trebuia să deducă singură dacă un produs poate fi comandat | `VERIFIED` | Da | — | `api/src/services/availability.ts:56-80`; `web/src/lib/pricing-contract.ts` |

## 2. Contractul de preț (`PRICE-*`)

| ID | Severitate | Simptom | Clasă | Stare | P0 | Dovadă |
|---|---|---|---|---|---|---|
| `PRICE-01` | P0 | Prețul de pornire din catalog (1,49 €) nu corespundea configurației cu care pornea configuratorul (1 GB/10 GB, 1,89 €) | `VERIFIED` | Da | **Da** | `api/src/services/pricing.ts` (`priceBook`); `web/src/lib/pricing-contract.ts` |
| `PRICE-02` | High | Nu exista un contract comun de preț între catalog, configurator, revizie și checkout: fiecare strat își calcula suma, iar o regulă nouă într-un strat lăsa celelalte în urmă | `VERIFIED` | Da | — | `api/src/routes/catalog.ts` (`pricing`); `web/src/lib/pricing-contract.ts` |
| `PRICE-03` | High | Estimarea se calcula în interfață, cu o formulă duplicată, deci putea diverge de server | `VERIFIED` | Da | — | `api/src/routes/catalog.ts:169` (citață) |
| `PRICE-04` | Medium | Prețul recomandat nu era distinct de cel minim: erau două numere cu două înțelesuri, iar clientul nu putea să știe ce plătește | `VERIFIED` | Da | — | `api/src/services/pricing.ts:86-114` |

## 3. Tabelele de date (`TBL-*`)

| ID | Severitate | Simptom | Clasă | Stare | P0 | Dovadă |
|---|---|---|---|---|---|---|
| `TBL-01` | High | Componenta comună `DataTable` punea `class="grid"` pe `<tbody>`, ceea ce distrugea modelul de coloane: decalaj măsurat între 23 și 679 px între antet și corp | `VERIFIED` | Da | — | `web/src/ui-app.tsx` (`DataTable`); `audit/_tools/sweep-before.json` |
| `TBL-02` | High | Tabela înregistrărilor DNS era scrisă de mână, cu rândurile scoase din tabel: decalaj de 1133 px | `VERIFIED` | Da | — | `web/src/app/Domains.tsx:314` (raportul 18) |
| `TBL-03` | Medium | Textul, datele, prețurile și stările se rupeau în coloane numerice și de stare; nu exista o regulă comună pentru aliniere, `nowrap` sau trunchiere | `VERIFIED` | Da | — | `web/src/lib/table.ts` |
| `TBL-04` | Medium | Stările de încărcare și de gol nu se aliniau cu antetul, deci tabelul sărea la încărcare | `CODE-INSPECTED` | Da | — | `web/src/ui-app.tsx` (`DataTable`) |

## 4. Panoul clientului (`DASH-*`)

Sursă: `audit/18-customer-dashboard-audit.md`.

| ID | Severitate | Simptom | Clasă | Stare | P0 | Dovadă |
|---|---|---|---|---|---|---|
| `DASH-01` | Medium | Starea goală din „Domains" trimitea la `/app`, nu la fluxul de deploy | `VERIFIED` | Da | — | `web/src/app/Domains.tsx:140` |
| `DASH-02` | Low | Starea goală din „Billing" trimitea la `/app`, nu la fluxul de deploy | `VERIFIED` | Da | — | `web/src/app/Billing.tsx:212` |
| `DASH-03` | High | Tabela DNS: antetul decalat cu până la 1133 px față de corp | `VERIFIED` | Da | — | `web/src/app/Domains.tsx:314` |
| `DASH-04` | Medium | Pagina principală prezenta 12 aplicații hardcodate, dintre care 7 nu existau în catalog, cu prețuri ilustrative și un buton activ „Deploy WordPress" pentru un produs `TEMPORARILY_UNAVAILABLE` | `VERIFIED` | Da | — | `web/src/home/Studio.tsx`; `web/src/home/Story.tsx`; `web/src/home/Configurator.tsx`; `web/src/home/Ticker.tsx`; `web/src/data.ts` |
| `DASH-05` | Medium | Meniul și paginile de documentație prezentau 7 produse care nu există în catalog, fiecare cu pagină proprie | `VERIFIED` | Da | — | `web/src/home/Nav.tsx`; `web/src/pages/Docs.tsx`; `web/src/home/Ticker.tsx` |
| `DASH-06` | Medium | Tab-urile paginii de instanță nu erau în adresă: fără intrare în istoric, fără link partajabil, reîncărcarea revine la „Overview" | `CODE-INSPECTED` | Nu | — | `web/src/app/InstanceDetail.tsx:593,704` |
| `DASH-07` | Medium | Al doilea panou „Settings" rămâne vizibil permanent sub tab-panel, lângă tabul „Settings" | `CODE-INSPECTED` | Nu | — | `web/src/app/InstanceDetail.tsx:497,721` |
| `DASH-08` | Medium | `window.prompt` nativ pentru parola de bază de date (în clar) și pentru alias | `CODE-INSPECTED` | Nu | — | `web/src/app/instance/DatabasesTab.tsx:83`; `NetworkTab.tsx:78` |
| `DASH-09` | Medium | Formularul de rețea cere IP și port pe care clientul nu le poate afla din interfață, în ciuda comentariului propriu al modulului | `CODE-INSPECTED` | Nu | — | `web/src/app/instance/NetworkTab.tsx:28-34` |
| `DASH-10` | Low | Acțiunea „Power" trimite întotdeauna `restart`; clientul nu poate alege pornire sau oprire | `CODE-INSPECTED` | Nu | — | `web/src/app/instance/SchedulesTab.tsx:38,64` |
| `DASH-11` | Low | Caseta „Payment method" din „Billing" arăta același text de două ori, ca valoare și ca subtitlu | `VERIFIED` | Da | — | `web/src/app/Billing.tsx` |

## 5. Ciclul de viață al prețului (`PLP-*`)

Sursă: `audit/19-pricing-lifecycle-audit.md`.

| ID | Severitate | Simptom | Clasă | Stare | P0 | Dovadă |
|---|---|---|---|---|---|---|
| `PLP-01` | P0 | WordPress era taxat cu 149 și putea fi comandat, fără `eggId`: plata se accepta pentru un serviciu care nu putea fi creat | `VERIFIED` | Parțial | **Da** | DB producție + `api/src/services/availability.ts` (codul reparat; valoarea din DB rămâne) |
| `PLP-02` | High | Build-ul din serviciu era mai vechi decât fixul de contract de preț: API-ul nu trimitea `pricing`/`availability` | `VERIFIED` | Parțial | — | API live + conținut container + git (codul reparat; deployul nu) |
| `PLP-03` | Medium | Configurația recomandată (5 GB) cădea în afara grilei de pas a sliderului: sliderul arăta 4 GB, se taxa 5 GB | `VERIFIED` | Da | — | `web/src/lib/pricing-contract.ts` (`ramOptions`/`cpuOptions`/`diskOptions`) |
| `PLP-04` | Medium | Stocarea maximă anunțată (50 GB) nu era comandabilă: sliderul se oprea la 49 GB | `VERIFIED` | Da | — | `web/src/lib/pricing-contract.ts` (`diskOptions`) |
| `PLP-05` | Low | Memoria minimă (256 MB) era afișată „0,3 GB" în textul care numește configurația prețului | `VERIFIED` | Da | — | `web/src/lib/pricing.ts` (`memLabel`) |
| `PLP-06` | Low / Info | Catalogul putea calcula prețul anunțat dintr-un alt rând de preț decât cel care prețuiește comanda | `CODE-INSPECTED` | Nu | — | `api/src/routes/catalog.ts:49` vs `api/src/services/pricing.ts:130` |
| `PLP-07` | High | Campania live era 100% fără plafon per cont, iar reducerea nu ajungea la Stripe: prima comandă exista deja cu `total 0` | `VERIFIED` | Parțial | — | DB producție + `api/src/services/order-amounts.ts` |
| `PLP-08` | Low / Info | Contractul API nu descria cartea de preț nouă, iar câmpurile de sumă nu își spuneau unitatea | `CODE-INSPECTED` | Da | — | `docs/API_CONTRACT.md` |
| `PLP-09` | Low / Info | Simulatorul de marketing arăta „Discord Bot · 256 MB · 5 GB · 1,49 €", dar 1,49 € cumpăra 1 GB | `CODE-INSPECTED` | Da | — | `web/src/home/Studio.tsx`; `web/src/home/Story.tsx`; `web/src/home/Configurator.tsx` |

## 6. Plățile și comanda (`PAY-*`)

| ID | Severitate | Simptom | Clasă | Stare | P0 | Dovadă |
|---|---|---|---|---|---|---|
| `PAY-01` | High | Starea plăților nu era cerută niciodată de interfață: comanda se crea, apoi checkout-ul eșua; în producție există 4 comenzi rămase în `AWAITING_PAYMENT` | `VERIFIED` | Da | — | `api/src/routes/billing.ts` (`GET /billing/payment-state`) |
| `PAY-02` | Medium | Mesajul „Checkout is not available" din configurator era inaccesibil: navigarea la pasul 4 preceda checkout-ul, deci clientul nu vedea niciodată motivul | `CODE-INSPECTED` | Nu | — | `web/src/app/Deploy.tsx:799` |
| `PAY-03` | Medium | O comandă acoperită integral de promoție era trimisă la un furnizor de plată care nu poate încasa zero, iar comanda rămâne în așteptare | `VERIFIED` | Da | — | `api/src/routes/orders.ts` (calea fără plată) |

## 7. Sesiunile și contul (`SESS-*`)

Sursă: `audit/20-sessions-and-account-security.md`.

| ID | Severitate | Simptom | Clasă | Stare | P0 | Dovadă |
|---|---|---|---|---|---|---|
| `SESS-01` | High | Adresa înregistrată în sesiuni și în jurnal era adresa proxy-ului, nu a clientului: 241 dintre cele 269 de sesiuni vii aveau o adresă Cloudflare | `VERIFIED` | Parțial | — | `web/server.mjs`; `api/src/app.ts` (codul reparat; gateway-ul rămâne) |
| `SESS-02` | High | Limita de 10 autentificări / 15 min era cheiată pe adresa edge-ului Cloudflare, nu pe cont și nu pe adresa clientului | `VERIFIED` | Parțial | — | `api/src/routes/auth.ts` (limită per cont); adresa reală cere gateway-ul |
| `SESS-03` | Medium | Orice browser de pe iOS era afișat ca „Safari on iOS" | `VERIFIED` | Da | — | `api/src/routes/settings.ts` (`describeAgent`) |
| `SESS-04` | Medium | Niciun câmp al listei nu deosebea două sesiuni ale aceluiași dispozitiv: datele fără oră, fără ultimă activitate și fără filtrarea celor expirate | `VERIFIED` | Da | — | `api/prisma/schema.prisma`; `api/prisma/migrations/20261024110000_session_last_seen/`; `api/src/routes/settings.ts` |
| `SESS-05` | Medium | Fiecare autentificare crea o sesiune nouă, iar cele vechi rămăneau valide 14 zile: 269 de sesiuni pe 6 conturi, dintre care 226 create la mai puțin de 10 minute | `VERIFIED` | Da | — | `api/src/plugins/auth.ts` (rotire, plafă, jurnal) |
| `SESS-06` | Low | Panoul promite „dispozitive" și livrează sesiuni; nu există „închide celelalte sesiuni" și revogarea se baza pe steaua locală, nu pe răspunsul serverului | `CODE-INSPECTED` | Da | — | `api/src/routes/settings.ts` (`DELETE /settings/sessions`); `web/src/app/Settings.tsx` |
| `SESS-07` | Info | Nu există al doilea factor, deci nu există categorie de sesiuni „în așteptarea confirmării MFA" | `NOT-IMPLEMENTED` | Nu | — | căutare în `api/src` și `web/src` |
| `SESS-08` | Medium | API-ul avea încredere în tot `172.16.0.0/12` (confirmă `SEC-05`) | `CODE-INSPECTED` | Parțial | — | `api/src/env.ts:95` |

## 8. Consistenta vizuală (`CONS-*`)

Sursă: `audit/21-visual-consistency-contract.md`.

| ID | Severitate | Simptom | Clasă | Stare | P0 | Dovadă |
|---|---|---|---|---|---|---|
| `CONS-01` | High | Tabela înregistrărilor DNS era un tabel scris de mână, cu rândurile scoase din tabel | `VERIFIED` | Da | — | `web/src/app/Domains.tsx` (aceeași cauză ca `TBL-02`) |
| `CONS-02` | Medium | Trei insigne de stare desenate de mână, în trei mărimi, niciunul `StatusPill` | `VERIFIED` | Da | — | `web/src/ui-app.tsx` (`STATUS_TONE`); `web/src/app/Settings.tsx`; `web/src/app/DeployCatalog.tsx` |
| `CONS-03` | Medium | Banda de filtrare era desenată de mână în locul controlului comun `Segmented` | `VERIFIED` | Da | — | `web/src/app/Instances.tsx`; `web/src/app/DeployCatalog.tsx` |
| `CONS-04` | Medium | Butonul periculos era folosit pentru o acțiune inofensivă | `VERIFIED` | Da | — | `web/src/app/Settings.tsx`; `web/src/app/instance/SettingsTab.tsx`; `web/src/app/Domains.tsx` |
| `CONS-05` | Medium | Câmpurile de mediu din tabul „Startup" erau desenate de mână, la 48 px și 14 px | `CODE-INSPECTED` | Da | — | `web/src/app/instance/StartupTab.tsx` |
| `CONS-06` | Low | Butonul secundar era desenat de mână în 8 locuri, în trei mărimi, cu o stare dezactivată diferită | `CODE-INSPECTED` | Parțial | — | `web/src/ui-app.tsx` |

## 9. Interfața de administrare (`ADM-*`)

Sursă: `audit/22-admin-interface-audit.md`.

| ID | Severitate | Simptom | Clasă | Stare | P0 | Dovadă |
|---|---|---|---|---|---|---|
| `ADM-01` | Critical | Rutele de bilete verificau doar rolul, nu `tickets.read`/`tickets.write`: orice staff putea citi notele interne, răspunde clienților și închide bilete | `CODE-INSPECTED` | Da | — | `api/src/routes/tickets.ts` (`requireTicketPermission`) |
| `ADM-02` | High | Escaladare de privilegii: `PUT /admin/staff/:userId` cerea doar `staff.write`, deci orice staff putea acorda rolul ADMIN, deși interfața limitează editorul la ADMIN | `CODE-INSPECTED` | Da | — | `api/src/routes/admin.ts` (`forbidden` la schimbarea rolului) |
| `ADM-03` | Critical | „Retry provisioning" apărea pe orice instanță, inclusiv `ONLINE`, iar provisionarea crea un al doilea server când panoul nu răspundea | `CODE-INSPECTED` | Da | — | `api/src/routes/admin.ts`; `api/src/services/provisioning.ts` |
| `ADM-04` | High | Interfața nu avea niciun control pentru `eggId`, deci un produs nou nu putea fi deschis pentru comandă | `VERIFIED` | Da | — | `web/src/admin/Products.tsx` (`EggForm`) |
| `ADM-05` | Medium | Pentru un produs blocat, randarea de pe desktop nu avea comutatorul „Stop ordering", iar cea de pe telefon îl avea: cele două randări nu corespundeau | `VERIFIED` | Da | — | `web/src/admin/Products.tsx` |
| `ADM-06` | High | Nu exista refund administrativ: permisiunea `orders.write` era definită și nefolosită | `CODE-INSPECTED` | Da | — | `api/src/routes/admin.ts` (`POST /admin/orders/:id/refund`); `web/src/admin/Orders.tsx` |
| `ADM-07` | High | `POST /auth/login` întorcea `permissions: []` și clientul păstra răspunsul de login: un staff cu permisiuni limitate vedea toată interfața admin până la reîncărcare | `VERIFIED` | Da | — | `api/src/routes/auth.ts` (permisiunile în răspunsul de login); `web/src/session.tsx`; `web/src/admin/Overview.tsx` |
| `ADM-08` | Medium | Pagina de început a adminului cerea `customers.read`, dar expunea cifra de afaceri: venitul lunii, MRR, numărul de comenzi și de bilete | `CODE-INSPECTED` | Nu | — | `api/src/routes/admin.ts:48`; `web/src/admin/Overview.tsx` |
| `ADM-09` | Medium | Jurnalul administrativ era plafonat la 300 de rânduri fără paginare, fără IP-ul sursă și fără `meta` (motivul scris la suspendare/retry) | `VERIFIED` | Da | — | `api/src/routes/admin.ts` (IP în jurnal); `web/src/admin/Audit.tsx` |
| `ADM-10` | Medium | Ecranul de prețuri nu avea nicio verificare de permisiune și nu putea dezactiva un preț | `VERIFIED` | Da | — | `web/src/admin/permissions.ts`; `web/src/admin/Pricing.tsx` |
| `ADM-11` | Medium | Meniul de atribuire se popula din `GET /admin/staff`, apelat necondiționat: un staff cu `tickets.write` fără `staff.read` nu putea atribui niciun bilet, fără mesaj | `CODE-INSPECTED` | Parțial | — | `web/src/admin/Tickets.tsx` (control dezactivat cu explicație) |
| `ADM-12` | Medium | Toate listele administrative erau plafonate server-side (200/300) fără paginare și fără nicio indicație că lista e trunchiată | `VERIFIED` | Parțial | — | `api/src/routes/admin.ts` (`total`); `web/src/admin/Overview.tsx` (`TruncationNote`) |
| `ADM-13` | Medium | Patru operații pe care API-ul le oferă nu aveau interfață: cheia de client a panoului, importul unei servere existente, raportul de livrare a e-mailului | `CODE-INSPECTED` | Nu | — | `api/src/routes/admin.ts:236,268,849,884` |
| `ADM-14` | Low / Info | Catalogul public, fără sesiune, expunea `deployable`, `eggId` și mesajele interne de blocaj | `VERIFIED` | Nu | — | `api/src/routes/catalog.ts:114,152` |
| `ADM-15` | Low / Info | Patru acțiuni de scriere fără confirmare: „Sync panel", „Save price", „Save permissions", crearea unei promoții | `VERIFIED` | Da | — | `web/src/admin/Pricing.tsx`; `Staff.tsx`; `Promotions.tsx`; `Infrastructure.tsx` |
| `ADM-16` | Low / Info | Butonul „Show e-mails" dezvăluia adresele clienților în zona staff fără nicio urmă în jurnal | `CODE-INSPECTED` | Nu | — | `web/src/admin/Customers.tsx:13` |

## 10. Navigare și stări goale (`NAV-*`)

| ID | Severitate | Simptom | Clasă | Stare | P0 | Dovadă |
|---|---|---|---|---|---|---|
| `NAV-01` | Medium | Stările goale trimiteau la `/app`, care nu duce la deploy | `VERIFIED` | Da | — | `web/src/app/Domains.tsx:140`; `web/src/app/Billing.tsx:213` |
| `NAV-02` | Medium | Catalogul public cerea de cinci ori și părea gol la încărcare | `VERIFIED` | Da | — | `web/src/lib/pricing.ts:40-51`; `web/src/home/Catalog.tsx:36` |
