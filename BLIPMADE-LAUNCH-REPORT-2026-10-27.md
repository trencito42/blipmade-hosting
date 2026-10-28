# Raport de lansare — Blipmade, 27 octombrie 2026

Runda aceasta a fost despre trei lucruri: activarea produselor care nu puteau fi livrate, pregătirea pachetului de plăți live și punerea platformei într-o stare în care lansarea nu mai ascunde nimic.

---

## 1. Ce este gata și verificat

### Codul și lansarea

| Punct | Stare |
| --- | --- |
| `main` pe GitHub | pushat, fast-forward, fără force-push |
| CI | **7/7 joburi verzi** pe ultimul commit |
| Suita API | **112 fișiere, 1048 teste trecute, 6 sărite** |
| Suita web | **305/305** |
| Typecheck API + teste | curat |
| Migrări în producție | **18 aplicate, 0 în așteptare, 0 eșuate** |
| Containere | **5/5 healthy** |
| Eticheta SHA pe imagini | citită cu `docker inspect`, nu dedusă: e commitul care rulează |
| Smoke de producție | **31/31** |
| Datele | intacte: 4 utilizatori, 10 comenzi, 5 produse, 5 instanțe, 734 rânduri de audit |

Commiturile acestei runde, toate fast-forward: `eaf4728` (ouă, parole, catalog, scripturi), `18fdd16` (tipul instanței într-un test), `2c59f46` (starea reală a lui Stripe, scriptul de deployment, auditul documentației), `2437a13` (o conductă ruptă într-un script).

### Produsele care nu puteau fi livrate

Cele trei produse — Code Server, Uptime Kuma și PostgreSQL — primesc acum ouăle oficiale ale lui Pterodactyl, nu un oupă inventat.

- **Ouăle se leagă după nume, nu după număr.** Numărul unui ou aparține panoului și este dat la import; numele este scris în ou. Un produs care își numește oul funcționează și când panoul este mutat sau când oul este importat din nou. Numerele deja cunoscute sunt păstrate, deci un ou importat înainte de această schimbare este găsit în continuare.
- **Platforma știe mediul fiecărui ou.** Șabloanele pentru cele trei ouă sunt verificate contra fișierelor oficiale de un test, deci un șablon și un ou nu se pot desparti în tăcere.
- **Parola este făcută pentru fiecare instanță.** Ouăle cer o parolă în variabilele lor, iar panoul refuză un server fără ea. Valoarea implicită a oului e aceeași pentru toți clienții, deci nu e folosită: doi clienți ar avea aceeași parolă. Platforma face o valoare per instanță, o scrie în mediul containerului și o ține pe instanță, criptată. Proprietarul o citește în consola serviciului, iar fiecare cerere e înregistrată în audit.
- **Catalo**gul numește oul fiecărui produs și poartă imaginea lui.
- **WordPress a fost închis din nou.** Era marcat „se poate comanda" și arăta spre oul 15, oul generic Node.js: un client ar fi primit un container Node.js, nu WordPress. Acum e închis, iar descrierea spune adevărul.

### Ce e gata pentru operator

| Livrabil | Ce face |
| --- | --- |
| `pterodactyl-eggs/postgres16.json`, `code-server.json`, `uptime-kuma.json` | fișierele oficiale, în formatul pe care panoul îl citește, verificate |
| `pterodactyl-eggs/README.md` | pasul exact de import, în interfața panoului |
| `scripts/fetch-eggs.mjs` | reia fișierele și le verifică în același mod în care le verifică panoul |
| `api/src/services/ops-health.ts` | al doilea-lea check, `panel`: întreabă panoul cu cererea de care se folosește provisionarea și deosebește cheia refuzată de cheia fără permisiune |
| `api/src/services/notification-events.ts`, `api/src/lib/email-design.ts`, `api/src/services/notifications.ts` | evenimentul, templateul și publisher-ul alarmei `ops.panel_unreachable` |
| `api/src/routes/ops.ts` | ruta de confirmare a unui finding știe și check-ul `panel` |
| `scripts/apply-panel-key.sh` | comanda pentru cheia Application API: o citește de la intrare și o verifică cu codul platformei |
| `api/tests/ops-panel-check.test.ts` | check-ul de panou e testat cu panoul înlocuit: răspuns bun, cheie refuzată, permisiune lipsă |
| `docs/OPERATIONS-HEALTH.md`, `docs/LAUNCH-CHECKLIST.md` | ceasele de supraveghere, canalul Discord și pasul cheii de panou |
| `scripts/apply-stripe-live.sh` | pune cheile live în `.env` într-un singur pas |
| `scripts/deploy-test-instance.sh` | construiește o instanță reală a unui produs și o verifică |
| `docs/LAUNCH-CHECKLIST.md` | tot ce mai trebuie făcut, cu comenzile exacte |

Scriptul pentru cheile Stripe a fost testat pe o copie de `.env`: refuză o cheie de sandbox, păstrează o copie a fișierului înainte de scriere, scrie fiecare valoare o singură dată și repornește api-ul și worker-ul împreună.

---

## 2. Răspunsurile la cele trei întrebări

### „Cum intru pe el să bag cheile alea?"

Platforma rulează pe mașina `10.77.0.13` (VM103), în `/opt/blipmade`. **Nu există SSH public pe ea**: DNAT-ul de pe hypervisor trece porturile de serviciu, nu portul 22, iar mașina nu are adresă public. Accesul este prin rețeaua internă:

```bash
ssh -i <cheia ta> debian@10.77.0.13
cd /opt/blipmade
```

Fișierul cu cheile este `/opt/blipmade/.env`. Cheile Stripe se aplică cu o singură comandă, care le citește de la intrare (nu apar în lista proceselor și nici în istoricul shell-ului):

```bash
printf '%s\n' "$STRIPE_SECRET_KEY" "$STRIPE_PUBLISHABLE_KEY" "$STRIPE_WEBHOOK_SECRET" \
  | ./scripts/apply-stripe-live.sh
```

Alternativ, cum ai ales: trimite-le aici și le aplic eu în aceeași comandă. Secretul rămâne atunci în transcriptul conversației, deci **rotați-le după lansare**.

### „De ce e blocker dacă ouăle sunt pe GitHub?"

Fișierele sunt, într-adevăr, pe GitHub — și sunt deja aici, în `pterodactyl-eggs/`, verificate. Dar **panoul nu citește ouăle singur**: Application API-ul lui poate *citi* ouăle (`GET /api/application/nests/{id}/eggs`) și nu le poate *crea* (`POST` pe aceeași rută răspunde 405, cu „Supported methods: GET, HEAD"; `/api/admin/...` răspunde 404). Singura cale de import e interfața de admin, ca la orice Pterodactyl.

Deci blocajul a fost de trei feluri, nu unul:

1. **Importul în panou** — o singură acțiune în interfața de admin, de vreo 3 minute: *Administration → Nests → Discord Bots → Import Egg*, de trei ori, cu cele trei fișiere. SSH pe panou n-am, și nu e nevoie.
2. **Șabloanele mediului în cod** — făcute: platforma știe acum ce variabile cer cele trei ouă și scrie mediul complet la creare. Fără asta, primul client al fiecărui produs ar fi eșuat la pasul „server_created", exact ca la incidentul BM-00007.
3. **Parola per instanță** — făcută: ouăle cer o parolă, iar cea implicită e comună tuturor clienților. Platforma face una per instanță și o ține criptată.

După import, eu fac restul: sincronizarea ouălor, testul de deployment real al fiecăruia, deschiderea produselor și rescrierea paginilor de documentație.

### „Am cerut reset de parolă și n-am primit mail pe stefan@xodo.ro"

Diagnosticul e luat din logul lui Postfix, nu ghicit. Platforma **a generat și a predat** resetul la 14:33:01, și serverul de mail al tău l-a refuzat:

```
550 5.1.0 <no-reply@blipmade.com>: Sender address rejected:
User unknown in virtual mailbox table (in reply to RCPT TO command)
```

`mail.xodo.ro` verifică expeditorul în propria tabelă de căsuțe virtuale, iar `no-reply@blipmade.com` nu e acolo. Gmail acceptă mesajele platformei (`250 2.0.0 OK - gsmtp`), deci problema nu e la platformă. Fixul e pe serverul tău de mail, în `main.cf`:

```
smtpd_reject_unlisted_sender = no
```

apoi `postfix reload`. Cealaltă cale e să adaugi `no-reply@blipmade.com` în tabela de căsuțe virtuale a acelui server.

În plus, `blipmade.com` nu are MX, deci niciun mesaj trimis din el nu poate fi răspuns, și alertele `ops.*` ajung într-o căsuță locală Mailcow și nu ies din server.

---

## 2 bis. Ce s-a aflat la 18:00, după întrebarea despre reset

**Al doilea reset al unui client nu pleca niciodată.** Cheia unui eveniment din outbox spune ce îl face pe același eveniment, iar pentru o cerere a clientului cheia era doar tipul evenimentului și contul clientului. Așadar, orice cerere a unui client era *același* eveniment: motorul găsea evenimentul primei cereri, hotăra că lucrul s-a întâmplat deja și nu trimitea nimic.

Am reprodus asta în producție: la 14:32 și la 17:40, `stefan@xodo.ro` a cerut resetul. Primul mesaj a fost refuzat de serverul de mail al destinatarului, deci **a doua cerere a fost cea care conta** — și ea a fost înghițită. Clientul primea răspuns „s-a cerut resetul" și niciun mesaj nu pleca vreodată. Contează și pentru tine: dacă ai fi apăsat de cinci ori, tot un singur mesaj ar fi plecat.

Reparat (commit `b89a454`, în producție, CI 7/7, suita 1036/1042): fiecare cerere poartă acum propria sa „ocurență" — rândul tokenului pentru cererile care au token, momentul schimbării pentru celelalte. Atinge resetul de parolă, confirmarea adresei, schimbarea adresei și schimbarea parolei. Testul cere de două ori și așteaptă două evenimente și două mesaje.

**Verificarea trimiterii pe xodo.ro, după reparație:** am cerut resetul de două ori, la 18:01. Platforma a scris două evenimente și a trimis două mesaje (18:01:04 și 18:01:11). Relay-ul le-a predat lui `mail.xodo.ro`, care le-a refuzat pe amândouă, cu același motiv:

```
550 5.1.0 <no-reply@blipmade.com>: Sender address rejected:
User unknown in virtual mailbox table (in reply to RCPT TO command)
```

**Adăugarea domeniului `blipmade.com` pe `mail.xodo.ro` nu ajută**, pentru că verificarea nu e despre domeniul primit, ci despre *adresa expeditorului*: `mail.xodo.ro` cere ca `no-reply@blipmade.com` să existe în tabela lui de căsuțe virtuale. Fixul rămâne pe serverul tău: fie `smtpd_reject_unlisted_sender = no` în `main.cf` și `postfix reload`, fie creezi căsuța `no-reply@blipmade.com` în tabela de căsuțe virtuale.

**O lacună de onestitate rămasă (necorectată):** platforma scrie „delivered" în tabelul livrărilor pentru că relay-ul a primit mesajul. Bounce-ul se întoarce la `no-reply@blipmade.com` și este salvat în căsuța de pe Mailcow (`250 2.0.0 ... Saved`), iar platforma nu îl citește nicăieri: nu știe că mesajul a fost refuzat. Citirea bounce-urilor (IMAP + corelarea cu mesajul) e o funcție de făcut, nu e în acest release.

**Webhook-ul Discord:** valoarea nu se mai găsește în istoricul păstrat (doar adrese de exemplu din cod și din teste), deci nu a fost aplicată niciodată — `.env` nu are `OPS_DISCORD_WEBHOOK_URL` și nu există fișier. Nu te mai trimit în chat: rulezi o comandă, care citește adresa de la intrare, o scrie într-un fișier pe care doar proprietarul îl poate citi și trimite un mesaj de test chiar prin codul platformei:

```bash
printf '%s' "$WEBHOOK" | ./scripts/set-discord-webhook.sh
```

---

## 2 ter. Ce s-a aflat la 18:15, când am probat comanda de webhook pe mașina reală

Am vrut să validez comanda de webhook pe mașina reală, cu o adresă falsă, ca să nu o primești tu prima dată. A fost bine: **trei probleme reale**, toate reparate înainte să primești comanda.

**1. Scriptul nu se mai termina.** `node` rulează în containerul API-ului, iar modulele platformei deschid conexiuni proprii (baza de date, cache-ul), deci procesul rămâne viu după ce termină treaba. Scriptul stătea în așteptarea ieșirii lui: mesajul de test plecase, răspunsul era primit, iar comanda nu revenea — un operator ar fi rămas în fața unei comenzi care părea înghețată. **Aceeași eroare era în `scripts/deploy-test-instance.sh`**, adică în scriptul cu care se face proba reală de deployment: instanța s-ar fi construit, iar scriptul ar fi rămas blocat. Reparare: programul își încheie procesul, apelul e limitat în timp (`timeout`), iar un test nou (`api/tests/script-node-exit.test.ts`) cere ca orice apel de `node` din containere să fie limitat în timp și să-și termine procesul.

**2. Platforma nu vedea fișierul cu adresa.** Fișierul era scris pe gazdă, dar nu era montat în containere, iar modul `0600` al lui `debian` (uid 1000) nu poate fi citit de `blip` (uid 100) din container. Platforma răspundea „no Discord channel is configured" — exact răspunsul greșit pentru o adresă corectă. Reparare: fișierele de compose montează fișierul în API și în worker, la același drum pe mașină și în container, doar pentru citire; fișierul e `0444` într-un director `0700`, deci e la îndemâna proprietarului și a platformei, și a nimănui altcineva; scriptul verifică acum, înainte de mesajul de test, că platforma vede fișierul, și spune limpede dacă nu.

**3. Probe-ul prin SMTP a măsurat cauza exactă a refuzului de pe `mail.xodo.ro`.** Trimis din afara serverului tău, la RCPT TO:

| Expeditor | Răspunsul lui `mail.xodo.ro` |
| --- | --- |
| `probe@google.com` | `250 2.1.5 Ok` |
| `probe@mail.blipmade.com` | `250 2.1.5 Ok` |
| `probe@example.org` | `550 5.7.27 ... does not accept mail (nullMX)` |
| `no-reply@blipmade.com` | `550 5.1.0 ... User unknown in virtual mailbox table` |

Deci `mail.xodo.ro` acceptă orice expeditor al cărui domeniu poate fi rezolvat, și refuză `blipmade.com` pentru că **domeniul îl cunoaște** (l-ai adăugat) dar **nu are căsuța `no-reply`** în tabelul lui de căsuțe virtuale. Fixul rămâne pe serverul tău: creezi căsuța (sau aliasul) `no-reply@blipmade.com` în Mailcow de pe `mail.xodo.ro` — **Domains → blipmade.com → Mailboxes / Aliases → no-reply** — sau pui `smtpd_reject_unlisted_sender = no` în `main.cf` și `postfix reload`.

**Starea DNS a lui `blipmade.com`, măsurată acum:**

| Record | Starea de acum | Ce trebuie |
| --- | --- | --- |
| MX | **lipsește** | `MX 10 mail.blipmade.com` — fără el domeniul nu poate fi răspuns, iar serverele stricte îl refuză ca `nullMX` |
| SPF | `v=spf1 mx a ip4:193.34.214.20 ~all` | poate fi strâns la `v=spf1 mx ip4:193.34.214.20 ~all`, pentru că `a` duce la Cloudflare |
| DKIM | `dkim._domainkey.blipmade.com` există; platforma semnează `d=blipmade.com, s=dkim` | de verificat în Mailcow că valoarea publicată e cea din **Domains → blipmade.com → DKIM** |
| PTR `193.34.214.20` (mail.blipmade.com) | **lipsește** | se cere la furnizorul de adrese |
| PTR `193.34.214.143` (edge) | **lipsește** | se cere la furnizorul de adrese |

**Adresa webhook-ului:** în istoricul păstrat nu există decât adrese de exemplu din cod și din teste; valoarea trimisă de tine nu mai e acolo. Deci nu a fost aplicată niciodată — `.env` nu are `OPS_DISCORD*` și nu există fișier — și nu o mai caut în chat. Comanda e gata și **probată pe mașina reală**: cu adresa falsă, scriptul a scris fișierul, a repornit serviciile, a confirmat că platforma vede fișierul, a chemat Discord și a răspuns „404" — exact ce trebuie pentru o adresă falsă. Adresa falsă a fost eliminată după probă, `.env` a fost readus la starea lui, producția e curată.

---

## 2 quater. Cheile live, aplicate la 18:44, și un bug găsit chiar de acolo

**Cheile Stripe live sunt în producție.** Le-am aplicat cu `scripts/apply-stripe-live.sh`, citite de la intrare (nu apar în lista proceselor, nici în istoricul shell-ului):

| | |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `PAYMENTS_ENABLED` | `true` |
| `STRIPE_TEST_MODE` | `false` |

`/api/health` spune acum `stripe: live`. **Endpoint-ul de webhook Stripe e verificat cu cheia live**: o livrare semnată corect, trimisă prin adresa publică `https://blipmade.com/api/webhooks/stripe`, a primit `200 {"received":true}` și a fost scrisă în jurnalul evenimentelor fără efecte asupra comenzilor (5 utilizatori, 11 comenzi, 0 plătite, 5 instanțe — întregul a rămas neatins).

**Canalul Discord e viu.** Adresa e în `/opt/blipmade/secrets/discord-webhook` (`0444`, într-un director `0700`), iar `.env` spune platformei unde e. Mesajul de test a fost primit: *„the answer of Discord: sent — Discord took the message"*. Alarmele platformei ajung în canal.

**Bug găsit chiar acum:** la prima încercare, Discord a răspuns `400`. Payload-ul era bine format, cu un singur defect: câmpul severității pleca **fără valoare**, pentru că severitatea testului (`info`) nu era în harta de cuvinte. Discord refuză **mesajul întreg** când un câmp nu are valoare — deci fiecare alarmă a platformei s-ar fi pierdut la fel, fără nimeni care să afle de ce. Reparare: `info` e acum o severitate cu cuvântul și culoarea ei, orice câmp al embed-ului are valoare (o severitate necunoscută cade pe cuvântul ei), iar un test ține regula: fiecare câmp are valoare, pentru fiecare severitate. **Fără proba pe mașina reală, acest bug ar fi rămas ascuns până la prima alarmă reală.**

---

## 2 quinquies. Resetul platformei: fresh start, 27 octombrie, între 19:10 și 19:25

**Ce s-a șters.** Tot ce ținea de clienți, în panou și în baza de date:

| Unde | Ce a plecat |
| --- | --- |
| Panou | 4 servere ale clienților (17, 18, 19, 21) și 4 conturi de client create de platformă (25, 26, 27, 28) |
| Baza de date | 4 instanțe, comenzile și liniile lor, 754 evenimente de provisionare, rândurile de audit, toate livrările de mail, toate notificările, abonamentele, tichetele, domeniile de mail, sesiunile și evenimentele Stripe |
| Conturi | 3 administratori și 1 client rămși din prima rundă |

**Ce a rămas:** catalogul cu cele 5 produse și prețurile lui, ouăle de pe panou, cheile Stripe live, canalul Discord, și **exact două conturi**:

| Cont | Rol | Nume |
| --- | --- | --- |
| `nissqbv@gmail.com` | ADMIN | Catalin Marian Nitu |
| `horja3i@gmail.com` | ADMIN | Horia Andrei |

Parola lor este cea de administrator pe care o aveai deja (din `ADMIN_PASSWORD`), iar `ADMIN_EMAIL` din `.env` indică acum `nissqbv@gmail.com`, ca seed-ul de la deploy să nu mai recreeze `admin@blipmade.com`. Am intrat cu ambele conturi ca să verific: răspuns `200`.

**Backup înainte de reset:** `blipmade-pre-reset-20261027T190410Z.tar.gz`, copiat și în afara clusterului. Dacă vrei ceva înapoi, se poate restaura din el.

**Un cont de administrator al panoului a rămas:** `stefan@xodo.ro` (id 1), pentru că panoul refuză să ștergă un cont cu servere atașate — și acel cont deține șablonul de runtime al platformei (serverul 16), de pe care platforma clonează serverele noi. Contul `stefan10xdd@gmail.com` (id 2) a fost șters.

---

## 2 sexies. Errorul 400 de pe pagina principală

Consola din browser arăta `POST https://blipmade.com/api/catalog/quote 400 (Bad Request)`. Răspunsul serverului e corect: cotă se cere pentru un produs care poate fi comandat. Măsurat pe fiecare produs: `discord-bot` cotă **200**, iar `wordpress`, `code-server`, `uptime-kuma` și `postgresql` răspund **400** cu „not available to order yet: It has not been validated for deployment yet". Deci nu era o eroare a serverului: era teaserul de pe pagina principală care cerea cotă unui produs închis, pentru că lua primul produs cu preț, nu primul care poate fi comandat.

Reparat: teaserul arată un produs care poate fi comandat și nu cere cotă deloc când produsul nu poate fi comandat. Decizia e o funcție cu test propriu (`teaserProduct`).

Verificat pe pagina reală, cu un browser: după reparare, **toate** cererile paginii sunt `200` — inclusiv cele două `POST /api/catalog/quote`. Înainte, cota produsului închis era singura cerere cu `400`.

**O notă de incident, pentru că e în jurnal:** între 19:12 și 19:18 mașina platformei a fost suprasolicitată (load average peste 50) și pagina publică nu a răspuns câteva minute. Cauza a fost un diagnostic al meu: o buclă de o sută de interogări de bază de date, fiecare într-un `docker exec` separat, pe mașina de producție. Platforma în sine era sănătoasă (containerele healthy, baza de date răspundea), iar încărcarea a coborât singură. Le spun pentru că a fost o decizie greșită a mea, nu o problemă a platformei: diagnosticele pe o mașină de producție se fac cu o singură interogare, nu cu o buclă.

---

## 2 septies. Platforma spune acum când nu poate vorbi cu panoul (20:36–20:45)

**Măsurat:** cheia Application API a panoului a fost revocată. `GET /api/application/servers` răspunde `401 Unauthenticated`, deci platforma nu poate nici să listeze serverele, nici să construiască o instanță. Până la ora 20:36 asta nu producea niciun zgomot: o comandă nouă eșua în tăcere, într-un loc unde nimeni nu privește.

**Acum:** sweep-ul de sănătate are un al doilea-lea check, `panel`, care întreabă panoul cu aceeași întrebare ca provisionarea — aceeași cerere, aceeași cheie. Rezultatul măsurat pe mașina reală:

| | |
| --- | --- |
| Stare | `critical` |
| Finding | `panel:application-key` |
| Rezumat | „The panel refused the key of the platform." |
| Detaliu | `Pterodactyl GET /api/application/servers?per_page=100 failed with 401. Unauthenticated.` |

Rezumatul deosebește două probleme care se repară în două locuri diferite: `401` înseamnă că cheia nu mai e acceptată și trebuie făcută din nou în panou, `403` înseamnă că cheia e acceptată dar nu are permisiunea de citit serverele.

**Alarma are traseul complet, măsurat la 20:43:** eveniment propriu `ops.panel_unreachable` în catalog, template propriu, publisher propriu. În producție: e-mailul operatorului livrat prin SMTP (`delivered`), mesajul Discord trimis (niciun refuz în logul workerului), linia scrisă în jurnalul alarmelor (`/var/backups/blipmade/status/ops-alerts.ndjson`).

**Verificat pe mașina reală, ca administrator:** `GET /api/ops/health` răspunde `200` și listează **12** check-uri, dintre care `panel` în `critical`. Sweep-ul din worker a raportat „12 check(s), 1 finding(s), 1 alarm(s) sent, 0 held back".

**Scriptul pentru cheie:** `scripts/apply-panel-key.sh` citește cheia de la intrare (deci nu apare în lista proceselor și nici în istoricul shell-ului), păstrează o copie a `.env` înainte de scriere, repornește api-ul și worker-ul și **verifică cheia cu codul platformei**: o cheie refuzată e prinsă acolo, nu la prima comandă a unui client. Testat cu o cheie falsă — exit 1, mesaj explicit.

**Ce a rămas la operator:** cheia Application API nouă (Administration → API Keys → Application API, cu permisiunea de creare servere) și aplicarea ei:

```bash
printf '%s' "$PANEL_KEY" | ./scripts/apply-panel-key.sh
```

**Încă un cont de administrator:** `stefan@xodo.ro` a fost ridicat la ADMIN la 19:52, la cererea ta („dă-mi admin"). Deci sunt **trei** conturi cu rol ADMIN — `nissqbv@gmail.com`, `horja3i@gmail.com` și `stefan@xodo.ro` — și toate trei au încă aceeași parolă (`ADMIN_PASSWORD`).

---

## 2 octies. Starea panoului, măsurată pe 28 octombrie (09:2x–10:3x)

Ai spus că pe `stefan@xodo.ro` nu mai ești admin în Pterodactyl. Am măsurat panoul și, la prima vedere, părea că baza lui de date a fost înlocuită. **Nu este așa: e ștergerea mea de la reset, și am greșit să o citesc altfel.**

| Ce am încercat | Ce a răspuns | Ce înseamnă |
| --- | --- | --- |
| `GET /api/application/servers` cu cheia din `.env` | `401 Unauthenticated` | cheia Application API nu mai există în panou |
| bridge-ul de chei cu `external_id`-ul `blipmade_acc_…fcql2sz0` | `404 not_found` | contul de panou `nissqbv-fcql2sz0@panel.blipmade.invalid` — **user 27, șters de mine** la reset |
| bridge-ul de chei cu un `external_id` inventat | `404 not_found` | bridge-ul e viu: PHP-ul panoului e viu și baza lui de date răspunde |
| `https://panel.blipmade.com` de pe mașina de mail | `200` | panoul e viu și pe adresa publică (DNAT `193.34.214.86` → `10.77.0.10:443`) |

**Ce am șters eu, pe 27 octombrie, la „fresh start" (cu backup înainte):** serverele 17, 18, 19, 21 și conturile de panou 19, 20, 23, 24, 25, 26, 27, 28 — plus **administratorul de panou `stefan10xdd@gmail.com` (id 2)**. Contul `stefan@xodo.ro` (id 1) a rămas, fiindcă panoul refuză să ștergă un cont cu servere atașate (deține șablonul de runtime, serverul 16).

**Cauza cea mai probabilă pentru `401`:** în Pterodactyl, cheia Application API trăiește în tabela `api_keys`, cu `user_id` către contul care a creat-o, iar ștergerea unui utilizator șterge în cascadă cheile lui. Dacă cheia `ptla_` a fost făcută de contul `stefan10xdd@gmail.com` (id 2), atunci ea a murit **odată cu contul pe care eu l-am șters**, și nu a fost revocată de nimeni. Dacă a fost făcută de `stefan@xodo.ro` (id 1), atunci e o revogare sau o expirare — iar soluția e aceeași: **o cheie nouă**.

**Ce am legat și eu, în platformă:** contul `nissqbv@gmail.com` păstra în baza platformei `pterodactylExternalId` către un cont de panou pe care eu îl ștersesem. L-am gol azi (cu backup: `/var/backups/blipmade/user-table-before-external-id-cleanup.sql`), ca platforma să nu caute un cont care nu mai există.

**Ce am nevoie de la tine ca să repar singur:** un shell pe mașina panoului (VM 100, `10.77.0.10`) — cu `sudo`, pentru baza lui MySQL. Cu accesul ăsta fac eu tot, în ordine: văd cine mai e root admin și îl repar (sau îl fac pe `stefan@xodo.ro`), creez cheia Application API cu permisiunea de creare servere, o aplic cu `scripts/apply-panel-key.sh` și verific că provisionarea merge, verific ouăle și șablonul de runtime și le recreez dacă nu mai sunt.

Pe mașina panoului, ca `root`:

```bash
install -d -m 700 -o debian -g debian /home/debian/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJFdTjf/ZTIsB+4q8GWD0oUr55H4e0N1+fACwS0rIMjj' >> /home/debian/.ssh/authorized_keys
chown debian:debian /home/debian/.ssh/authorized_keys
chmod 600 /home/debian/.ssh/authorized_keys
```

**Dacă vrei să o faci tu, fără să-mi dai acces:** intră în panou cu `stefan@xodo.ro` (dacă panoul spune că e deja instalat și nu te lasă, deschide `https://panel.blipmade.com/setup` — dacă nu mai există niciun root admin, acolo se face primul). Apoi Administration → API Keys → **Application API**, cu permisiunea de creare servere, și aplic-o:

```bash
printf '%s' "$PANEL_KEY" | ./scripts/apply-panel-key.sh
```

**Stripe — e făcut, cu o lipsă măsurată.** Endpointul există, e `enabled` și indică `https://blipmade.com/api/webhooks/stripe`. Trimite `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `payment_intent.payment_failed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted` și `charge.refunded`. **Lipsește `checkout.session.expired`** — eveniment pe care platforma îl citește (`routes/webhooks.ts:781`) și fără el o comandă abandonată rămâne „payment required" la nesfârșit. În plus, `charge.refunded` nu e citit deloc de platformă (refundul se face din panoul de administrare), deci cerința lui din checklist era greșită — am corectat documentația.

---

## 2 nonies. Panoul reparat și probele de deployment (28 octombrie, 12:27–13:15)

Ai spus că pe `stefan@xodo.ro` nu mai ești admin în Pterodactyl. Am măsurat baza de date a panoului (shell pe VM 100, cu acordul tău) și am aflat cauza exactă: **tabela `api_keys` era goală**. Conturile de administrator erau toate trei intacte (`stefan@xodo.ro`, `horja3i@gmail.com`, `nissqbv@gmail.com`, toate cu `root_admin = 1`) — tu erai admin în continuare. Ce murise era **cheia**: fusese făcută de contul `stefan10xdd@gmail.com`, iar în Pterodactyl cheile unui utilizator dispar odată cu utilizatorul — contul ăla l-am șters eu la resetul din 27 octombrie, și cheia a murit odată cu el.

**Ce am făcut, în ordine:**

1. **Cheie nouă**, făcută prin serviciul panoului (nu SQL manual): id 26, al contului `stefan@xodo.ro`, cu permisiunea de a crea servere și conturi de client și de a citi nodurile, ouăle, cuiburile și locațiile; acceptată doar de la `10.77.0.13`. Copie la `/root/panel-key.txt` pe panou (mod 600).
2. **Aplicată platformei** cu `scripts/apply-panel-key.sh` (cheia a mers prin canalul standard, nu prin ecran și nici prin lista proceselor). Răspunsul platformei: „the panel answered: 1 server(s)".
3. **Check-ul `panel` a trecut din `critical` în `ok`** — verificat de două ori: prin codul platformei și prin API-ul de administrator (`GET /api/ops/health` → 12 check-uri, `panel` în `ok`).
4. **Trei ouă importate** prin serviciul de import al panoului: `Postgres 16` (17), `Code-Server` (18), `Uptime Kuma` (19), toate în cuibul 5. Variabilele lor sunt exact cele pe care platforma le scrie în mediu.
5. **Unelte puse în repo** (`panel-bridge/tools/`), ca reparația să se poată repeta: `blipmade-create-key.php` și `blipmade-import-egg.php`.

**Probele reale de deployment** (clienți și comenzi de test, marcate „verify", curățate la sfârșit):

| Produs | Rezultat | Catalog |
| --- | --- | --- |
| Discord Bot | containerul e viu, instanța `ONLINE` | comandabil |
| PostgreSQL | baza de date răspunde pe portul nodului, instanța `ONLINE` | comandabil |
| Code Server | editorul răspunde cu HTTP 302, instanța `ONLINE` | comandabil |
| Uptime Kuma | containerul moare la pornire, portul nu se deschide | **închis** |
| WordPress | nu există oul lui în panou | **închis** |

**De ce Uptime Kuma rămâne închis:** containerul conține uptime-kuma 2.5.8, al cărui `package.json` cere Node **>= 20.4.0**, iar oul îl instalează și îl rulează în `node:18-alpine`. Aplicația iese imediat, nodul spune `offline`, portul nu se deschide niciodată. Nu am deschis un produs care nu merge — trebuie schimbat oul (un container de Node 20+) și probat din nou.

**Două bug-uri reale ale platformei, găsite de aceste probe și reparate:**

- **PostgreSQL era verificat cu HTTP** — o bază de date care funcționa era declarată stricată, iar clientul ar fi primit banii înapoi pentru un serviciu sănătos. Proba produsului e acum o conexiune TCP (`{"kind": "tcp"}`).
- **Un container pornit cu o secundă înainte** e „starting" și nu folosește încă memorie. Verificarea dădea faliment imediat, deci o livrare care pornea normal ar fi fost refuzată și clientul ar fi fost rambursat. Verificarea așteaptă acum, iar un container care nu pornește rămâne o eroare, cu starea nodului în motiv.

**Curățat după probe:** cele 5 servere și cele 5 conturi de test din panou (prin lista albă a `scripts/cleanup-panel.py`, cu `--confirm`) și toate rândurile „verify" din baza platformei (138 de rânduri). Panoul are acum: șablonul de runtime (serverul 16), cei trei administratori și cheia de aplicație. Baza platformei are: 3 utilizatori, 0 comenzi, 0 instanțe.

**O greșeală a mea, prinsă înainte de ștergere:** lista albă a curățării voia să ștergă contul tău (`stefan@xodo.ro`), care era încă acolo de la prima rundă. L-am scos înainte de orice ștergere și am scris în cod de ce: contul tine șablonul de runtime și cheia de aplicație. Constantele care protejau șablonul arătau spre un server șters din prima rundă; le-am îndreptat spre cel viu (id 16).

---

## 3. Ce mai trebuie făcut pentru lansare

| # | Acțiune | Cine | Cum se verifică |
| --- | --- | --- | --- |
| 0 | Schimbă parolele celor trei conturi de administrator (`nissqbv@gmail.com`, `horja3i@gmail.com`, `stefan@xodo.ro`) — acum toate trei au parola veche de administrator | **operator** | fiecare intră cu parola lui |
| 0 bis | ~~Fă o cheie Application API nouă în panou~~ — **rezolvat pe 28 octombrie**: cheia e făcută, aplicată și verificată; check-ul `panel` e `ok` | **gata** | provisionarea funcționează: PostgreSQL, Code Server și Discord Bot au fost construite pe nod și au răspuns `ONLINE` |
| 1 | Importă cele trei ouă în panou | **operator** | API-ul panoului răspunde cu `Postgres 16`, `Code-Server`, `Uptime Kuma` |
| 2 | ~~Trimite cheile Stripe live~~ — **făcut** (18:44) | — | `/api/health` arată `stripe: live`; o livrare semnată primește `200` |
| 3 | În dashboard-ul Stripe: endpointul e deja legat (`https://blipmade.com/api/webhooks/stripe`, `enabled`) — **mai adaugă evenimentul `checkout.session.expired`**, care lipsește și pe care platforma îl citește | **operator** | o comandă reală de plată ajunge la platformă și marchează comanda plătită |
| 3 bis | Pentru Uptime Kuma: schimbă oul (container de Node 20+, imagine care rulează pe el) și probă produsul din nou — acum e închis, pentru că aplicația cere Node >= 20.4 și oul o rulează pe node:18 | **agent + operator** | containerul rămâne pornit și portul răspunde |
| 4 | Pe `mail.xodo.ro`: căsuța (sau aliasul) `no-reply@blipmade.com`, ori `smtpd_reject_unlisted_sender = no` + `postfix reload` | **operator** | resetul de parolă ajunge la `stefan@xodo.ro` |
| 5 | DNS: `MX 10 mail.blipmade.com` pentru `blipmade.com`, PTR pentru `193.34.214.20` și `193.34.214.143` | **operator** | mesajele din domeniu primesc răspuns și nu cad în spam |
| 6 | Wildcard `*.apps.blipmade.com` → `A 193.34.214.143`, DNS only | **operator** | adresa de instanță se deschide pe HTTPS |
| 7 | ~~Adresa webhook-ului Discord~~ — **făcut** (18:50) | — | Discord a primit mesajul de test |
| 8 | Cheia publică age a operatorului | **operator** | `scripts/recovery-package.sh` poate construi pachetul |
| 9 | Găzduitor extern pentru copiile de backup | **operator** | o copie trăiește în afara clusterului |
| 10 | Testul de deployment real al celor trei produse | **eu**, după pasul 1 | o instanță răspunde pe nod |
| 11 | Deschiderea produselor în catalog + rescrierea paginilor | **eu**, după pasul 10 | catalogul arată `DEPLOYABLE`, pagina nu mai are „Planned" |

### Despre curățenia instanțelor

Nu se șterge nimic. Cele cinci instanțe din producție aparțin unor comenzi reale (BM-00007, BM-00008, BM-00010, BM-00011, BM-00012) ale unor clienți, nu unor teste: `stefan@xodo.ro` (două), `steph@ripboyband.com` (una), `nissqbv@gmail.com` (una activă, una anulată). Niciuna nu e candidat la curățare.

---

## 4. Lucruri care rămân deschise, cu onestitate

- **Produsele trei nu pot fi comandate încă.** Catalogul le arată corect ca „COMING_SOON", cu motivul „It has not been validated for deployment yet". Ele se deschid numai după ce un server de fiecare a fost construit și a răspuns pe nod.
- **WordPress nu e livrabil** și rămâne listat, dar închis. Nu există oul de WordPress pe panou.
- **Plățile rulează pe cheile live** (din 27 octombrie, 18:44) și `PAYMENTS_ENABLED=true`, dar **endpoint-ul de webhook din dashboard-ul Stripe încă nu e legat de platformă**: până când nu e, o plată reală nu marchează comanda plătită. Cheile live nu se mai pot schimba fără să se refacă secretul de webhook.
- **Platforma nu știe că un mail a fost refuzat.** Ea scrie „delivered" pentru că relay-ul a primit mesajul; bounce-ul se întoarce la `no-reply@blipmade.com` și rămâne în căsuța de pe Mailcow, nescit. Citirea bounce-urilor (IMAP + corelarea cu mesajul) e o funcție de făcut, nu e în acest release.
- **Adresele de instanță nu au încă HTTPS** cu un certificat propriu: edge-ul nu are încă recordul wildcard, iar TLS-on-demand cu dovadă TXT nu e legat.
- **Pachetul de recuperare criptat nu poate fi construit** fără cheia publică age a operatorului.
- **Offsite-ul copiilor de backup e tot în cluster** (mașina de mail, `10.77.0.14`), deci nu e independent de pierderea clusterului.

---

## 5. Ce s-a schimbat în cod

| Fișier | Ce face |
| --- | --- |
| `api/src/services/pterodactyl/application.ts` | șabloanele mediului sunt ținute după numele oului, cu rezolvarea numelui din panou |
| `api/src/services/instance-credentials.ts` | valorile făcute per instanță, criptate cu secretul deplasării |
| `api/src/services/provisioning.ts` | produsul este legat de oul după nume; parolele sunt scrise în mediu și păstrate pe instanță |
| `api/src/routes/instance-server.ts` | `GET /instances/:id/credentials` — proprietarul își citește parola |
| `api/src/routes/instances.ts` | instanța spune dacă are o parolă făcută de platformă |
| `api/src/routes/admin.ts`, `api/src/routes/catalog.ts` | produsul poate fi legat de un ou după nume |
| `api/src/services/availability.ts` | un produs care își numește oul e instalabil |
| `api/src/env.ts`, `api/src/routes/health.ts` | starea spune `sandbox` sau `live`, nu „live" pentru orice cheie |
| `api/prisma/schema.prisma` + migrarea `20261027160000` | `Product.eggName`, `Product.generatedVariables`, `Instance.generatedVariables` |
| `api/prisma/seed.ts` | catalogul numește oul fiecărui produs și declară parolele |
| `web/src/app/instance/CredentialsCard.tsx` | cardul cu parola serviciului, în consola instanței |
| `pterodactyl-eggs/*` | cele trei fișiere de ou, plus ghidul de import |
| `scripts/apply-stripe-live.sh` | comanda unică pentru cheile live |
| `scripts/deploy-test-instance.sh` | testul de deployment real |
| `scripts/set-discord-webhook.sh` | comanda pentru canalul de alarmă; scrie fișierul `0444` într-un director `0700`, verifică că platforma îl vede și își termină procesul |
| `compose.api.yml` | fișierul cu adresa canalului e montat în API și worker, la același drum ca pe mașină |
| `api/tests/script-node-exit.test.ts` | orice apel de `node` din containere e limitat în timp și își termină procesul; fișierul canalului e montat în ambele servicii |
| `scripts/fetch-eggs.mjs` | reia și verifică fișierele ouălor |
| `docs/LAUNCH-CHECKLIST.md` | lista de lansare cu comenzile exacte |
| `docs/DOCS_CLAIM_AUDIT.md`, `docs/docs-claim-audit.json` | auditul adus la starea nouă a catalogului |
