# Dovezile brute ale auditului de călătorie a clientului (Faza 2)

Toate numerele din `../CUSTOMER-JOURNEYS.md` pot fi verificate din fișierele din acest folder.

## Ieșiri

| Fișier | Ce este |
|---|---|
| `journeys-api-run.txt` | ieșirea brută a harnesului de API (119 pași), în ordinea executării |
| `journeys-api-results.json` | aceleași 119 de pași în format structurat (`n`, `area`, `step`, `status`, `observed`, `expected`, `evidence`) |
| `journeys-ui-run.txt` | ieșirea brută a harnesului de interfață (26 pași, Chromium) |

## Harnesses (rulă pe VM 103, în `/tmp/cj/`)

| Fișier | Rol |
|---|---|
| `t-journeys.mjs` | harnessul de API: 119 de pași pe cele șase arii, cu cookie jar și token CSRF |
| `t-ui.mjs` | harnessul de interfață (Playwright + Chromium prin `xvfb-run -a`) |
| `seed2.mjs` | seed-ul promoțiilor de test (`CJFREE100`, `CJTEST10`, `CJONCE`, `CJTHREE`); resetează și sloturile de campanie, ca testele de plafon să pornească de la o stare cunoscută |
| `dbq.mjs` | fereastră de citire în baza de date: `node dbq.mjs "<expresie>"` |
| `mail-sink.mjs` | căsuța de e-mail SMTP locală (cititor HTTP pe `:3526`) |
| `cj-panel-stub.mjs` | panoul Pterodactyl simulat (API aplicație pe `:3199`) — nu este în acest folder; rulează pe VM 103, în `/tmp/cj-panel-stub.mjs` |
| `node-responder.mjs` | răspunde HTTP pe adresele de alocare ale nodului (`10.77.0.11:25565‑25572`), ca sonda de sănătate a platformei să poată trece |
| `stub-reset.mjs` | readuce panoul simulat la o stare cunoscută (adrese libere, un server-sablon pe oul 15) |
| `sandbox-reset.sh` | resetează panoul, pornește responderul, repornește API-ul (`:3112`) și workerul (`:3113`) prin PID, apoi verifică că stiva comună (`:3101`, `:30003`) răspunde în continuare |
| `restart.sh` | repornește doar API-ul și workerul (fără panou) |

## Cum se rulează

```bash
# pe VM 103
bash /tmp/cj/sandbox-reset.sh                 # stare curată + contoare de ratăjare resetate
cd /tmp/cj-api && . /tmp/cj/env.sh
node seed2.mjs                                # promoțiile de test
node t-journeys.mjs > /tmp/cj/journeys-run.txt 2>&1
xvfb-run -a node /tmp/cj/t-ui.mjs > /tmp/cj/ui-run.txt 2>&1
```

## Siguranța mediului

- Baza de date: `cj_test` (nu `blipmade`, nu `blipmade_test`).
- Redis: indexul 3.
- Niciun proces nu a fost oprit cu `pkill`/`killall`; fiecare a fost oprit după PID-ul lui, iar `sandbox-reset.sh` verifică la final că stiva comună (`:3101`, `:30003`) răspunde.
- Portul 30002 și adresele publice (`https://blipmade.com`, `http://10.77.0.13:3000`) nu au fost folosite.
- Sursa aplicației nu a fost modificată.
