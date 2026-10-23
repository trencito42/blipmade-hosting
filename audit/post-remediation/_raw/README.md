# Date brute ale masuratorilor

Aceste fisiere sunt rezultatul brut al comenzilor, fara interpretare. Sunt
pastrate alaturi de rapoartele pentru ca fiecare cifra din raport sa poata fi
verificata.

## `perf-baseline.txt`

- **ATENTIE la unitati:** coloanele `TTFB` si `TOTAL` sunt in **SECUNDE**
  (comanda `curl -w '%{time_starttransfer} %{time_total}'` raporteaza secunde).
  Exemplu: `0.001874` inseamna **1,87 ms**, nu 0,001874 ms.
- Mediu: stiva izolata de pe VM 103 (build de productie Vite + `node server.mjs`),
  API pe 3101, web pe 30003, baza `blipmade_test`. **Nu este productie.**
- Comanda care a produs fisierul: `audit/_tools/perf-baseline.sh` (copiat pe VM
  la `/tmp/perf-baseline.sh`).

## Observatii verificate separat dupa rularea baseline-ului

- Fisierele cu hash din `dist/assets/` primesc `Cache-Control: public, max-age=31536000, immutable`.
- `index.html` primeste `Cache-Control: no-cache` (corect: nu trebuie cache-at la nesfarsit).
- Nu este trimis un header `ETag`. Pentru fisierele cu hash nu conteaza
  (`immutable`), pentru `index.html` ar fi o optimizare mica.
- `POST /api/catalog/quote` fara token CSRF intoarce **403** cu mesajul
  „Invalid or missing CSRF token." — este o protectie deliberata, nu un defect.
- Ruta reala a facturilor este `/api/billing/invoices`; `/api/invoices` nu exista
  (404 corect).
- Coada BullMQ la momentul masuratorii: `wait=0`, `active=0`, `failed=0` pentru
  `blipmade.provision` si `blipmade.email`.
- Cache ratio PostgreSQL: **99,73%**.
