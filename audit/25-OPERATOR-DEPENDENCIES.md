# 25 — Dependențe de operator: ce nu poate fi rezolvat în cod

**Data:** 2026-10-23.
**Natura:** document de implementare pentru operatorul platformei Blipmade.
**De ce există:** brief-ul de remediere cere ca fiecare dependență externă, credential lipsă sau
decizie de business să fie **pregătită în cod** și să aibă **dependența exactă, rămasă** scrisă
mai jos. Fiecare rând spune: ce a fost pregătit, ce lipsește, comanda exactă, rezultatul așteptat
și ce se deblochează.

Nimic din ce urmează nu a fost executat pe infrastructura de producție. Motivul este în brief:
nu se modifică datele de producție, nu se repartizează discuri, nu se rotește o credential live și
nu se schimbă reguli de firewall fără o procedură aprobată și un plan de rollback testat.

---

## 1. Plățile reale (`PROV-04`, `OPS-05`)

**Pregătit în cod:** calea de plată e completă și testată — cotatia, checkoutul, webhookul,
refundul, confirmarea unei comenzi acoperite integral de promoție și provisionarea condiționată
de plată. Testul `api/tests/order-amounts.test.ts` dovedește că o comandă cu promoție 100% ajunge
la `PAID` și își creează instanța **fără** să treacă printr-un furnizor de plată.

**Lipsește:** contul Stripe live și comutarea plăților.

```bash
# pe VM 103, in /opt/blipmade/.env
STRIPE_SECRET_KEY=sk_live_...        # cheia live
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...      # semnatura webhookului
PAYMENTS_ENABLED=true
```

**Verificare asteptata:**
```bash
curl -s https://blipmade.com/api/billing/payment-state | jq
# { "enabled": true, "simulated": false, "reason": null }
# apoi: un checkout real cu o carda de test, un webhook real acceptat, unul falsificat refuzat
```

**Dezblocheaza:** `OPS-02` (verificarea capcanei), `B-05`, `B-16`, `PROMO-02`, `PROMO-11` (o
campanie cu reducere poate rula), planul anual (`B-12`) si reconcilierea cu Stripe.

**Atentie:** o cheie Stripe live in productie platileaza bani reali. Testele de plata se fac cu
`STRIPE_TEST_MODE=true` si baza `blipmade_test` — niciodata cu cheia live.

---

## 2. Copia de backup in afara hostului (`INF-02`, `DR-02`, `DR-04`)

**Pregătit în cod:** `scripts/backup.sh` (dump + `.env` + fisiere clienti), `scripts/backup-offsite.sh`
(copie **criptata**, comparata cu originalul inainte de a se sterge copia locala),
`scripts/restore.sh` si `scripts/restore-drill.sh` (restaureaza intr-o baza de scratch si o
compara cu cea live; baza live nu e scrisa niciodata).

**Lipsește:** tinta off-host si cheia de criptare — decizia D-2 a operatorului.

```bash
# in /opt/blipmade/.env
OFFSITE_TARGET=rclone:blipmade-backups        # sau user@host:/srv/blipmade
OFFSITE_ENCRYPTION_KEY=<cheie>               # nu se accepta pe linia de comanda
OFFSITE_KEEP_COPIES=14
```

**Programarea** (lipsa, rezolvata in aceasta runda):
```bash
sudo /opt/blipmade/scripts/install-backup-timer.sh --run-now
systemctl list-timers blipmade-backup.timer
```

**Verificare asteptata:** `systemctl status blipmade-backup.service` arata ultima rulare reusita,
`/var/backups/blipmade` contine arhiva cu `.sha256`, iar drill-ul confirma ca o baza de scratch
recuperata are aceleasi tabele si aceleasi randuri:
```bash
/opt/blipmade/scripts/restore-drill.sh
```

**Dezblocheaza:** `B-09`, poarta 9 din decizia de lansare, si **conditia** pentru orice schimbare
de RAID (`B-10`) — schimbarea de RAID cere downtime si o copie verificata inainte.

---

## 3. RAID pe volumul de root (`INF-01`, `INF-03`)

**Pregătit:** nimic nu s-a atins pe volum. Cele doua variante (RAID 1 pe `/`, sau o cale
echivalenta cu copie pe alt suport) sunt descrise in raportul de infrastructura al rundei 1.

**Lipsește:** procedura aprobata si backupul de la punctul 2.

**Ordinea obligatorie:** backup off-host verificat → drill de restaurare reusit → backup local
suficient → procedura de schimbare cu downtime → test de citire dupa simularea pierderii unui disc.

**De ce nu s-a facut:** brief-ul interzice explicit schimbarea RAID fara procedura aprobata si
plan de rollback testat. Pierderea unui disc pe RAID 0 inseamna pierderea platformei.

---

## 4. Firewall si porturi de administrare (`SEC-01`, `SEC-28`, `INF-04`, `INF-05`)

**Pregătit:** auditul a identificat porturile ascultate (`8006` — panoul Pterodactyl, `111` — rpcbind,
plus porturile de administrare ale hipervisorului). `scripts/inventory.sh` citeste starea curenta
si poate fi rulat ca dovada.

**Lipsește:** decizia de a restrange filtrele. Ordinea din brief-ul de audit: **firewall inainte de
rotatia parolei**, altfel lockout.

**Verificare asteptata:**
```bash
ss -lntp | grep -E ':8006|:111' && echo 'NEVERIFICAT' || echo 'OK'
# si din exterior: porturile sunt filtrate
```

---

## 5. Rotatia parolei de `root` (`SEC-01`)

**Pregătit:** nimic. Depinde de punctul 4.

**De ce nu s-a facut:** o rotare de parola inainte de firewall poate lasa platforma inaccesibila
pentru operare. E o actiune de infrastructura cu risc de lockout, nu o schimbare de cod.

---

## 6. Produsul vandut: aplicatia care ruleaza (`OPS-01`, `PRICE-01`, `PRICE-04`)

**Pregătit:** poarta de eligibilitate e implementata si testata — un produs fara mapping de egg
pe panou **nu poate fi comandat**, iar interfata arata starea reala
(`TEMPORARILY_UNAVAILABLE`), fara buton de deploy. `api/prisma/seed.ts` descrie imaginea, comanda
de pornire si health-check-ul fiecarui produs.

**Lipsește:** decizia de produs — **ce aplicatie ruleaza** — si imaginea ei.

```bash
# in api/prisma/seed.ts, pentru produsul vandut:
dockerImage: 'ghcr.io/...:<tag>',   # imaginea reala
startupCommand: 'node server.js',   # comanda reala, nu 'npm run start'
healthProbe: { kind: 'http', path: '/healthz', expectStatus: 200 },
```

**Criteriul de verificare (din audit):** un container pornit raporteaza `state: online`,
`uptime > 0`, memorie nenula **si** endpointul aplicatiei raspunde. Un container `ONLINE` nu e
dovada ca produsul functioneaza.

**Dezblocheaza:** `B-74` si, cu el, `B-75` (provisionare conditionata de plata), `B-01`, `B-02`,
`B-77`, `B-78` — si implicit vanzarea.

---

## 7. URL-ul public al instantei (`OPS-04`, `OPS-05`)

**Pregătit:** mecanismul din cod rezerva domeniul, il elibereaza si il afiseaza; lipseste
configuratia de gateway.

**Lipsește, pe VM 102:**
```
DOMAIN_BASE=app.blipmade.com
CADDY_ADMIN_URL=http://127.0.0.1:2019
CADDY_ADMIN_TOKEN=<token>
```
si un bloc `admin` in `/etc/caddy/Caddyfile`, care lipseste, ca API-ul de admin sa poata crea
rutele.

**Criteriul de verificare:** o instanta provisionata primeste un URL public care raspunde, iar
DNS-ul se rezolva.

**De ce nu s-a facut:** accesul la Caddy-ul de pe VM 102 este o dependenta externa, iar rutele
publice trebuie sa treaca printr-un proxy care nu depinde de API-ul de admin al Caddy-ului.

---

## 8. Canalul de suport (`OPS-03`)

**Pregătit:** `api/src/services/notifications.ts` trimite prin `sendMail`; in lipsa unui releu, mesajul
ajunge in directorul `mail:` (fara releu, `SMTP_URL` gol) — mecanismul e verificat in testele de
livrare.

**Lipsește:** un releu SMTP real (o dependenta externa). Fara el, un bilet nou **nu ajunge** la
nimeni, iar `/status` raporteaza „Support — Degraded".

---

## 9. Cardul de pret si piata (`PORT-01`, `PORT-02`, `PORT-03`)

**Pregătit:** modelul de pret e corect acum (carte de preturi, discount distribuit pe linii,
configuratie si pret in aceeasi suma). **Pretul nu s-a schimbat**: valoarea reala a costului
serverului (`C_node`) si decizia asupra cardului de pret sunt D-1 a operatorului.

**Lipsește:** valoarea `C_node` de la operator si confirmarea profesionala pentru pozitiile
`NEEDS-PROFESSIONAL-CONFIRMATION` (29 de elemente de conformitate).

---

## 10. Sincronizarea infrastructurii (`PROV-11`, `PROV-06`)

**Pregătit:** `POST /admin/infrastructure/sync` citeste panoul si populeaza tabelele `Node` si `Egg`;
`feature_limits` poate fi corectat cu aceleasi date reale.

**Lipsește:** aprobarea de a rula sincronizarea in productie — ea **scrie in baza de date** (nu
destrige nimic, dar este o scriere in productie).

```bash
# dupa autentificarea ca staff cu infrastructure.write:
curl -X POST https://blipmade.com/api/admin/infrastructure/sync
```

**Criteriul de verificare:** tabelele `Node` si `Egg` sunt populate, iar `feature_limits` nu mai
promite baze de date si backupe pe produse care nu le au.

---

## 11. Adresele de proxy in care se crede (`SEC-P1-02`, `SESS-P1-04`)

**Pregatit in cod:** rezolvarea adresei clientului se face **din dreapta** lantului
`X-Forwarded-For` (`web/src/lib/client-address.mjs`), deci un client nu mai poate scrie in
lant o adresa aleasa de el; limita per-adresa a API-ului are cheia **adresa clientului, sau
conexiunea cand adresa nu se cunoaste** (`api/src/plugins/auth.ts` — `addressRateLimitKey`), deci
o limita nu mai poate deveni o limita pentru toata platforma nici cand lista de proxy-uri nu e
setata; contorul de autentificare numara **doar incercarile care au esuat**
(`api/src/lib/failed-attempts.ts`), deci un client care se autentifica de mai multe ori nu se
blocheaza singur.

**Masurat (faza 14):** fara reparare, un client care trimite `X-Forwarded-For: 9.9.9.9` era
inregistrat si limitat dupa `9.9.9.9`; fara reparare, a 11-a autentificare **corecta** era
refuzata cu HTTP 429. Cu repararea, ambele teste cad (`_raw/phase14-proof-unpatched.txt`).

**Lipseste:** valoarea exacta a listei de proxy-uri pentru **API**. In productie lista exista
doar ca implicit in `compose.api.yml`:

```bash
# implicitul curent (compose.api.yml): 127.0.0.1,::1,172.16.0.0/12
# valoarea recomandata, in /opt/blipmade/.env:
TRUSTED_PROXIES=127.0.0.1,::1,172.18.0.0/16
```

**De ce `172.18.0.0/16` si nu adresa containerului:** `172.18.0.0/16` este reteaua Docker
`blipmade_default` (masurat: `docker network inspect blipmade_default`), iar adresa containerului
web (`172.18.0.6` la masurare) **se schimba** la fiecare recreare a containerului. O lista cu
adresa exacta ar pierde increderea la prima redeploy, iar limita per-adresa ar deveni din nou o
limita pentru toata platforma. Lista implicita `172.16.0.0/12` este mai larga decat necesar:
ea crede si alte retele private.

**Verificare asteptata dupa ce valoarea e pusa:**
```bash
# 1. API-ul primeste lista de la web
docker exec blipmade-api-1 printenv TRUSTED_PROXIES
# 2. adresa clientului e cea a vizitatorului, nu a proxy-ului
#    (se vede in jurnalul de audit: ip = adresa reala)
docker exec blipmade-postgres-1 psql -U blipmade -d blipmade \
  -c "SELECT ip, count(*) FROM \"AuditLog\" GROUP BY ip ORDER BY count(*) DESC LIMIT 5;"
```

**Conditie de infrastructura (edge-ul, la 10.77.0.12):** edge-ul trebuie sa trimita
`X-Forwarded-For` cu adresa vizitatorului. Fara header, web-ul foloseste adresa socketului
(adresa edge-ului) si toti vizitatorii primesc aceeasi limita. Verificare: cererea de mai sus
trebuie sa arate adrese de vizitator, nu `10.77.0.12`.

**De ce conteaza:** fara lista, limitele per-adresa ale cotarii (120/min), comenzii (30/10 min) si
setarilor (5-10/15 min) sunt **un contor pentru toata platforma** — masurat de retestul
independent: 121 cotari au dat HTTP 429, iar un alt vizitator primea tot HTTP 429.

---

## 12. Ce mai blocheaza, pe scurt

| Dependența | Efectul | Cine decide |
|---|---|---|
| Cheia Stripe live | Nu se poate lua nicio plata reala | Operator |
| Tinta off-host + cheie | Copia locala nu e backup | Operator (D-2) |
| Procedura de RAID | Volumul de root e RAID 0 | Operator + downtime |
| Firewall + rotatia parolei | Porturi de administrare publice | Operator |
| Imaginea si comanda produsului vandut | Produsul nu contine aplicatia | Decizie de produs |
| Caddy admin + `DOMAIN_BASE` | Nicio instanta nu are URL public | Operator (VM 102) |
| Releu SMTP | Canalul de suport e inert | Operator |
| Valoarea `C_node` | Cardul de pret nu poate fi decis | Operator (D-1) |
| Lista `TRUSTED_PROXIES` a API-ului | Limitele per-adresa pot deveni limite de platforma | Operator |
| Cheie de audit pe VM 100/101 | 19 afirmatii raman neverificabile | Operator (D-3) |
| Confirmarea celor 3 adrese romanesti + regim fiscal | Citirea corecta a `SEC-01` | Operator (D-4) |

---

## 13. Ce s-a implementat fara nicio dependenta

Pentru contrast, lista exacta a ce a fost reparat in cod si verificat in aceasta runda este in
`audit/12-FULL-FINDINGS-REGISTER.md`, sectiunea „Starea remedierii", si in raportul de implementare
al rundei. Nimic din lista de mai sus a fost marcat ca reparat.
