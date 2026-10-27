# Raport de lansare — Blipmade, 27 octombrie 2026

Runda aceasta a fost despre trei lucruri: activarea produselor care nu puteau fi livrate, pregătirea pachetului de plăți live și punerea platformei într-o stare în care lansarea nu mai ascunde nimic.

---

## 1. Ce este gata și verificat

### Codul și lansarea

| Punct | Stare |
| --- | --- |
| `main` pe GitHub | pushat, fast-forward, fără force-push |
| CI | **7/7 joburi verzi** pe ultimul commit |
| Suita API | **108 fișiere, 1034 teste trecute, 6 sărite** |
| Suita web | **304/304** |
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

## 3. Ce mai trebuie făcut pentru lansare

| # | Acțiune | Cine | Cum se verifică |
| --- | --- | --- | --- |
| 1 | Importă cele trei ouă în panou | **operator** | API-ul panoului răspunde cu `Postgres 16`, `Code-Server`, `Uptime Kuma` |
| 2 | Trimite cheile Stripe live | **operator → eu** | `/api/health` arată `stripe: live` și `PAYMENTS_ENABLED=true` |
| 3 | `smtpd_reject_unlisted_sender = no` pe `mail.xodo.ro` | **operator** | resetul de parolă ajunge la `stefan@xodo.ro` |
| 4 | MX pentru `blipmade.com` + DKIM din Mailcow + PTR pentru `193.34.214.20` | **operator** | mesajele din domeniu primesc răspuns și nu cad în spam |
| 5 | Wildcard `*.apps.blipmade.com` → `A 193.34.214.143`, DNS only | **operator** | adresa de instanță se deschide pe HTTPS |
| 6 | Adresa webhook-ului Discord | **operator** | evenimentele ajung în canal |
| 7 | Cheia publică age a operatorului | **operator** | `scripts/recovery-package.sh` poate construi pachetul |
| 8 | Găzduitor extern pentru copiile de backup | **operator** | o copie trăiește în afara clusterului |
| 9 | Testul de deployment real al celor trei produse | **eu**, după pasul 1 | o instanță răspunde pe nod |
| 10 | Deschiderea produselor în catalog + rescrierea paginilor | **eu**, după pasul 9 | catalogul arată `DEPLOYABLE`, pagina nu mai are „Planned" |

### Despre curățenia instanțelor

Nu se șterge nimic. Cele cinci instanțe din producție aparțin unor comenzi reale (BM-00007, BM-00008, BM-00010, BM-00011, BM-00012) ale unor clienți, nu unor teste: `stefan@xodo.ro` (două), `steph@ripboyband.com` (una), `nissqbv@gmail.com` (una activă, una anulată). Niciuna nu e candidat la curățare.

---

## 4. Lucruri care rămân deschise, cu onestitate

- **Produsele trei nu pot fi comandate încă.** Catalogul le arată corect ca „COMING_SOON", cu motivul „It has not been validated for deployment yet". Ele se deschid numai după ce un server de fiecare a fost construit și a răspuns pe nod.
- **WordPress nu e livrabil** și rămâne listat, dar închis. Nu există oul de WordPress pe panou.
- **Plățile sunt încă în sandbox** și `PAYMENTS_ENABLED=false`: acum niciun client nu poate plăti. Cheile din `.env` sunt `sk_test_`/`pk_test_`. Am corectat `/api/health`, care spunea „live" și pentru cheile de sandbox — acum spune `sandbox`, ca să se vadă din stare.
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
| `scripts/fetch-eggs.mjs` | reia și verifică fișierele ouălor |
| `docs/LAUNCH-CHECKLIST.md` | lista de lansare cu comenzile exacte |
| `docs/DOCS_CLAIM_AUDIT.md`, `docs/docs-claim-audit.json` | auditul adus la starea nouă a catalogului |
