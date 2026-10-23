# 05 — Consistenta preturilor

**Data auditului:** 2026-10-23. **Audit READ-ONLY.**
**Sistemul de producție nu a fost modificat.** S-au făcut 255 de cereri `POST /api/catalog/quote` (endpoint public, fără efect, cu limita de 120/min respectată), interogări `SELECT` pe DB și citire de cod.

---

## 0. Convenția unităților — LĂSAȚI ASTA ÎNAINTE DE ORICE NUMĂR DIN ACEST RAPORT

> **Toate sumele din coloanele de preț de mai jos sunt în unități minori întregi (EUR cents).**
> `149` = **€1.49** · `172` = **€1.72** · `229` = **€2.29** · `452` = **€4.52** · `590` = **€5.90**

```text
api/src/lib/money.ts:2-3     "All monetary values are integer minor units (EUR cents)."
api/src/services/pricing.ts:32-37   "All prices are integer minor units. The rate card is: ..."
docs/API_CONTRACT.md:5       "Money is always an **integer number of minor units** (EUR cents). Never a float."
```

**Corectură pentru ceilalți agenți:** un raport anterior prezenta cardul de preț ca „172 EUR". Este greșit de 100×: `172` minor units = **€1.72**. Orice tabel preluat de altcineva din acest raport trebuie împărțit la 100 înainte de a fi comparat cu prețuri de concurență sau cu bugete.

**Observație de contract (B9 în `05-commerce-and-billing.md`):** câmpul public se numește `price.amount` (`api/src/routes/catalog.ts:59`) și **nu spune** că e în unități minori; convenția apare o singură dată, în `docs/API_CONTRACT.md:5`. Recomandare: redenumeire în `amountMinor` + repetarea unității pe fiecare câmp monetar din contract.

---

## 1. Spațiul de configurații pe care îl oferă wizard-ul de deploy

Replicat din cod, nu presupus:

```text
web/src/app/Deploy.tsx:32-33   RAM_STEPS_GB = [0.5,1,2,4,8,16,32,64,128]   CPU_STEPS = [1,2,4,8,16]
web/src/app/Deploy.tsx:136-137 ramScale(maxRam) = maxRam >= 1024 ? 1024 : 1
web/src/app/Deploy.tsx:149-153 valorile de RAM = pașii din RAM_STEPS_GB ∩ [minRam,maxRam] ∪ {minRam, maxRam, defaultRam}
web/src/app/Deploy.tsx:155-158 valorile de CPU = pașii din CPU_STEPS ∩ [minCpu,maxCpu] ∪ {minCpu, maxCpu, defaultCpu}
web/src/app/Deploy.tsx:161-168 pasul de disc = max(1, ceil((maxDisk - minDisk) / 20)); valorile = minDisk + k*pas
```

Pentru produsul **vândut** (`discord-bot`, singurul cu `deployable = true`):

```text
minRam 256 / minCpu 1 / minDisk 1        defaultRam 512 / defaultCpu 1 / defaultDisk 5
maxRam 4096 / maxCpu 4 / maxDisk 50

RAM  : 256, 512, 1024, 2048, 4096          (5 valori)
CPU  : 1, 2, 4                             (3 valori)
DISK : 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43, 46, 49   (17 valori)

TOTAL = 5 × 3 × 17 = 255 configurații
```

**Observație de produs:** pasul de disc este `ceil((50-1)/20) = 3`, deci valorile pornesc de la 1 și urcă din 3 în 3: **50 GB nu este selectabil** (maximul real oferit este 49 GB), iar **20 GB nu este selectabil** nici el. `maxDisk = 50` este deci un maxim declarat, nu un maxim atins. `CODE-INSPECTED` + `VERIFIED` (sweep live: niciun rând cu disk=50)

**Pentru celelalte 4 produse wizard-ul nu oferă nicio configurație:** `web/src/app/Deploy.tsx:304-328` afișează „Not available to deploy" când `!product.deployable`, iar API-ul respinge cotele:

```bash
$ curl -s -X POST https://blipmade.com/api/catalog/quote -H 'content-type: application/json' \
    -d '{"items":[{"productSlug":"wordpress","ram":512,"cpu":1,"disk":5}]}'
{"error":{"code":"bad_request","message":"WordPress is not available to order yet.","requestId":"req-2tp"}}
```

`VERIFIED` (live) — identic pentru `code-server`, `uptime-kuma`, `postgresql`. Cauza în cod: `api/src/services/pricing.ts:104`.

---

## 2. Matricea la nivel de produs — șase prețuri alături

Coloanele 1, 2, 5 și 6 sunt **la nivel de produs** (cardul de tarife); coloanele 3 și 4 sunt **la nivel de configurație**.

| produs | slug | deployable | 1. DB `ProductPrice.baseAmount` | 2. Catalogue API `price.amount` | 3. Deploy wizard | 4. Server quote | 5. Admin pricing screen | 6. Admin products screen | verdict |
|---|---|:--:|---:|---:|---|---:|---:|---:|:--|
| WordPress | `wordpress` | nu | 149 | 149 | n/a — wizardul refuză (`Deploy.tsx:304-328`) | `400 bad_request` „not available to order yet" | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| Code Server | `code-server` | nu | 299 | 299 | n/a — wizardul refuză | `400 bad_request` | 299 (+60/GB, +40/vCPU, +2/GB) | 299 | = |
| **Discord Bot** | `discord-bot` | **da** | 149 | 149 | 149 … 590 (255 valori, vezi §3) | 149 … 590 (255 valori) | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| Uptime Kuma | `uptime-kuma` | nu | 149 | 149 | n/a — wizardul refuză | `400 bad_request` | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| PostgreSQL | `postgresql` | nu | 449 | 449 | n/a — wizardul refuză | `400 bad_request` | 449 (+60/GB, +40/vCPU, +2/GB) | 449 | = |

Sursele celor șase coloane:

| col | sursă | fișă |
|---:|---|---|
| 1 | `SELECT pp."baseAmount" … FROM "Product" p LEFT JOIN "ProductPrice" pp` | DB producție, `VERIFIED` |
| 2 | `GET https://blipmade.com/api/catalog/products` | `VERIFIED` (live) |
| 3 | `web/src/app/Deploy.tsx:521,608,615,622,650` — randă `quote.total` din `POST /catalog/quote` | `CODE-INSPECTED` |
| 4 | `POST https://blipmade.com/api/catalog/quote` | `VERIFIED` (255/255 live) |
| 5 | `GET /admin/pricing` → `api/src/routes/admin.ts:517-534`; ecran `web/src/admin/Pricing.tsx:129-160` | `CODE-INSPECTED` |
| 6 | `GET /admin/products` → `api/src/routes/admin.ts:361-405`; ecran `web/src/admin/Products.tsx:111-113,168-170,252-253` („Base price") | `CODE-INSPECTED` |

**Rezultat: zero diferențe între cele șase prețuri, pentru toate cele 5 produse, în toate cele 255 de configurații oferite.** Nicio inconsistență de tarifare.

---

## 3. Matricea completă — fiecare configurație pe care wizard-ul o oferă

Coloanele 3 și 4 sunt **identice în toate cele 255 de rânduri**: prețul pe care îl afișează wizard-ul este prețul pe care îl întoarce serverul, pentru aceeași configurație. Coloanele 1, 2, 5 și 6 sunt constante la nivel de produs (149 pentru `discord-bot`).

S-au interogat live toate cele 255 de configurații prin `POST /api/catalog/quote`; toate cele 255 au răspuns 200 și toate se potrivesc **exact** cu formula motorului (0 nepotriviri).

| # | RAM (MB) | vCPU | Disk (GB) | 1. DB `ProductPrice.baseAmount` | 2. Catalogue API `price.amount` | 3. Deploy wizard shows | 4. Server quote (live) | 5. Admin pricing screen | 6. Admin products screen | Verdict |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|:--|
| 1 | 256 | 1 | 1 | 149 | 149 | 149 | 149 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 2 | 256 | 1 | 4 | 149 | 149 | 155 | 155 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 3 | 256 | 1 | 7 | 149 | 149 | 161 | 161 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 4 | 256 | 1 | 10 | 149 | 149 | 167 | 167 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 5 | 256 | 1 | 13 | 149 | 149 | 173 | 173 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 6 | 256 | 1 | 16 | 149 | 149 | 179 | 179 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 7 | 256 | 1 | 19 | 149 | 149 | 185 | 185 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 8 | 256 | 1 | 22 | 149 | 149 | 191 | 191 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 9 | 256 | 1 | 25 | 149 | 149 | 197 | 197 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 10 | 256 | 1 | 28 | 149 | 149 | 203 | 203 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 11 | 256 | 1 | 31 | 149 | 149 | 209 | 209 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 12 | 256 | 1 | 34 | 149 | 149 | 215 | 215 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 13 | 256 | 1 | 37 | 149 | 149 | 221 | 221 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 14 | 256 | 1 | 40 | 149 | 149 | 227 | 227 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 15 | 256 | 1 | 43 | 149 | 149 | 233 | 233 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 16 | 256 | 1 | 46 | 149 | 149 | 239 | 239 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 17 | 256 | 1 | 49 | 149 | 149 | 245 | 245 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 18 | 256 | 2 | 1 | 149 | 149 | 189 | 189 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 19 | 256 | 2 | 4 | 149 | 149 | 195 | 195 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 20 | 256 | 2 | 7 | 149 | 149 | 201 | 201 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 21 | 256 | 2 | 10 | 149 | 149 | 207 | 207 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 22 | 256 | 2 | 13 | 149 | 149 | 213 | 213 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 23 | 256 | 2 | 16 | 149 | 149 | 219 | 219 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 24 | 256 | 2 | 19 | 149 | 149 | 225 | 225 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 25 | 256 | 2 | 22 | 149 | 149 | 231 | 231 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 26 | 256 | 2 | 25 | 149 | 149 | 237 | 237 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 27 | 256 | 2 | 28 | 149 | 149 | 243 | 243 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 28 | 256 | 2 | 31 | 149 | 149 | 249 | 249 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 29 | 256 | 2 | 34 | 149 | 149 | 255 | 255 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 30 | 256 | 2 | 37 | 149 | 149 | 261 | 261 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 31 | 256 | 2 | 40 | 149 | 149 | 267 | 267 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 32 | 256 | 2 | 43 | 149 | 149 | 273 | 273 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 33 | 256 | 2 | 46 | 149 | 149 | 279 | 279 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 34 | 256 | 2 | 49 | 149 | 149 | 285 | 285 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 35 | 256 | 4 | 1 | 149 | 149 | 269 | 269 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 36 | 256 | 4 | 4 | 149 | 149 | 275 | 275 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 37 | 256 | 4 | 7 | 149 | 149 | 281 | 281 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 38 | 256 | 4 | 10 | 149 | 149 | 287 | 287 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 39 | 256 | 4 | 13 | 149 | 149 | 293 | 293 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 40 | 256 | 4 | 16 | 149 | 149 | 299 | 299 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 41 | 256 | 4 | 19 | 149 | 149 | 305 | 305 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 42 | 256 | 4 | 22 | 149 | 149 | 311 | 311 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 43 | 256 | 4 | 25 | 149 | 149 | 317 | 317 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 44 | 256 | 4 | 28 | 149 | 149 | 323 | 323 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 45 | 256 | 4 | 31 | 149 | 149 | 329 | 329 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 46 | 256 | 4 | 34 | 149 | 149 | 335 | 335 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 47 | 256 | 4 | 37 | 149 | 149 | 341 | 341 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 48 | 256 | 4 | 40 | 149 | 149 | 347 | 347 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 49 | 256 | 4 | 43 | 149 | 149 | 353 | 353 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 50 | 256 | 4 | 46 | 149 | 149 | 359 | 359 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 51 | 256 | 4 | 49 | 149 | 149 | 365 | 365 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 52 | 512 | 1 | 1 | 149 | 149 | 164 | 164 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 53 | 512 | 1 | 4 | 149 | 149 | 170 | 170 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 54 | 512 | 1 | 7 | 149 | 149 | 176 | 176 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 55 | 512 | 1 | 10 | 149 | 149 | 182 | 182 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 56 | 512 | 1 | 13 | 149 | 149 | 188 | 188 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 57 | 512 | 1 | 16 | 149 | 149 | 194 | 194 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 58 | 512 | 1 | 19 | 149 | 149 | 200 | 200 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 59 | 512 | 1 | 22 | 149 | 149 | 206 | 206 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 60 | 512 | 1 | 25 | 149 | 149 | 212 | 212 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 61 | 512 | 1 | 28 | 149 | 149 | 218 | 218 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 62 | 512 | 1 | 31 | 149 | 149 | 224 | 224 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 63 | 512 | 1 | 34 | 149 | 149 | 230 | 230 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 64 | 512 | 1 | 37 | 149 | 149 | 236 | 236 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 65 | 512 | 1 | 40 | 149 | 149 | 242 | 242 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 66 | 512 | 1 | 43 | 149 | 149 | 248 | 248 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 67 | 512 | 1 | 46 | 149 | 149 | 254 | 254 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 68 | 512 | 1 | 49 | 149 | 149 | 260 | 260 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 69 | 512 | 2 | 1 | 149 | 149 | 204 | 204 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 70 | 512 | 2 | 4 | 149 | 149 | 210 | 210 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 71 | 512 | 2 | 7 | 149 | 149 | 216 | 216 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 72 | 512 | 2 | 10 | 149 | 149 | 222 | 222 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 73 | 512 | 2 | 13 | 149 | 149 | 228 | 228 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 74 | 512 | 2 | 16 | 149 | 149 | 234 | 234 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 75 | 512 | 2 | 19 | 149 | 149 | 240 | 240 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 76 | 512 | 2 | 22 | 149 | 149 | 246 | 246 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 77 | 512 | 2 | 25 | 149 | 149 | 252 | 252 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 78 | 512 | 2 | 28 | 149 | 149 | 258 | 258 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 79 | 512 | 2 | 31 | 149 | 149 | 264 | 264 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 80 | 512 | 2 | 34 | 149 | 149 | 270 | 270 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 81 | 512 | 2 | 37 | 149 | 149 | 276 | 276 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 82 | 512 | 2 | 40 | 149 | 149 | 282 | 282 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 83 | 512 | 2 | 43 | 149 | 149 | 288 | 288 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 84 | 512 | 2 | 46 | 149 | 149 | 294 | 294 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 85 | 512 | 2 | 49 | 149 | 149 | 300 | 300 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 86 | 512 | 4 | 1 | 149 | 149 | 284 | 284 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 87 | 512 | 4 | 4 | 149 | 149 | 290 | 290 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 88 | 512 | 4 | 7 | 149 | 149 | 296 | 296 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 89 | 512 | 4 | 10 | 149 | 149 | 302 | 302 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 90 | 512 | 4 | 13 | 149 | 149 | 308 | 308 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 91 | 512 | 4 | 16 | 149 | 149 | 314 | 314 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 92 | 512 | 4 | 19 | 149 | 149 | 320 | 320 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 93 | 512 | 4 | 22 | 149 | 149 | 326 | 326 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 94 | 512 | 4 | 25 | 149 | 149 | 332 | 332 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 95 | 512 | 4 | 28 | 149 | 149 | 338 | 338 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 96 | 512 | 4 | 31 | 149 | 149 | 344 | 344 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 97 | 512 | 4 | 34 | 149 | 149 | 350 | 350 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 98 | 512 | 4 | 37 | 149 | 149 | 356 | 356 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 99 | 512 | 4 | 40 | 149 | 149 | 362 | 362 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 100 | 512 | 4 | 43 | 149 | 149 | 368 | 368 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 101 | 512 | 4 | 46 | 149 | 149 | 374 | 374 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 102 | 512 | 4 | 49 | 149 | 149 | 380 | 380 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 103 | 1024 | 1 | 1 | 149 | 149 | 194 | 194 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 104 | 1024 | 1 | 4 | 149 | 149 | 200 | 200 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 105 | 1024 | 1 | 7 | 149 | 149 | 206 | 206 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 106 | 1024 | 1 | 10 | 149 | 149 | 212 | 212 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 107 | 1024 | 1 | 13 | 149 | 149 | 218 | 218 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 108 | 1024 | 1 | 16 | 149 | 149 | 224 | 224 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 109 | 1024 | 1 | 19 | 149 | 149 | 230 | 230 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 110 | 1024 | 1 | 22 | 149 | 149 | 236 | 236 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 111 | 1024 | 1 | 25 | 149 | 149 | 242 | 242 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 112 | 1024 | 1 | 28 | 149 | 149 | 248 | 248 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 113 | 1024 | 1 | 31 | 149 | 149 | 254 | 254 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 114 | 1024 | 1 | 34 | 149 | 149 | 260 | 260 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 115 | 1024 | 1 | 37 | 149 | 149 | 266 | 266 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 116 | 1024 | 1 | 40 | 149 | 149 | 272 | 272 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 117 | 1024 | 1 | 43 | 149 | 149 | 278 | 278 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 118 | 1024 | 1 | 46 | 149 | 149 | 284 | 284 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 119 | 1024 | 1 | 49 | 149 | 149 | 290 | 290 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 120 | 1024 | 2 | 1 | 149 | 149 | 234 | 234 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 121 | 1024 | 2 | 4 | 149 | 149 | 240 | 240 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 122 | 1024 | 2 | 7 | 149 | 149 | 246 | 246 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 123 | 1024 | 2 | 10 | 149 | 149 | 252 | 252 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 124 | 1024 | 2 | 13 | 149 | 149 | 258 | 258 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 125 | 1024 | 2 | 16 | 149 | 149 | 264 | 264 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 126 | 1024 | 2 | 19 | 149 | 149 | 270 | 270 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 127 | 1024 | 2 | 22 | 149 | 149 | 276 | 276 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 128 | 1024 | 2 | 25 | 149 | 149 | 282 | 282 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 129 | 1024 | 2 | 28 | 149 | 149 | 288 | 288 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 130 | 1024 | 2 | 31 | 149 | 149 | 294 | 294 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 131 | 1024 | 2 | 34 | 149 | 149 | 300 | 300 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 132 | 1024 | 2 | 37 | 149 | 149 | 306 | 306 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 133 | 1024 | 2 | 40 | 149 | 149 | 312 | 312 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 134 | 1024 | 2 | 43 | 149 | 149 | 318 | 318 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 135 | 1024 | 2 | 46 | 149 | 149 | 324 | 324 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 136 | 1024 | 2 | 49 | 149 | 149 | 330 | 330 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 137 | 1024 | 4 | 1 | 149 | 149 | 314 | 314 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 138 | 1024 | 4 | 4 | 149 | 149 | 320 | 320 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 139 | 1024 | 4 | 7 | 149 | 149 | 326 | 326 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 140 | 1024 | 4 | 10 | 149 | 149 | 332 | 332 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 141 | 1024 | 4 | 13 | 149 | 149 | 338 | 338 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 142 | 1024 | 4 | 16 | 149 | 149 | 344 | 344 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 143 | 1024 | 4 | 19 | 149 | 149 | 350 | 350 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 144 | 1024 | 4 | 22 | 149 | 149 | 356 | 356 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 145 | 1024 | 4 | 25 | 149 | 149 | 362 | 362 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 146 | 1024 | 4 | 28 | 149 | 149 | 368 | 368 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 147 | 1024 | 4 | 31 | 149 | 149 | 374 | 374 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 148 | 1024 | 4 | 34 | 149 | 149 | 380 | 380 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 149 | 1024 | 4 | 37 | 149 | 149 | 386 | 386 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 150 | 1024 | 4 | 40 | 149 | 149 | 392 | 392 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 151 | 1024 | 4 | 43 | 149 | 149 | 398 | 398 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 152 | 1024 | 4 | 46 | 149 | 149 | 404 | 404 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 153 | 1024 | 4 | 49 | 149 | 149 | 410 | 410 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 154 | 2048 | 1 | 1 | 149 | 149 | 254 | 254 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 155 | 2048 | 1 | 4 | 149 | 149 | 260 | 260 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 156 | 2048 | 1 | 7 | 149 | 149 | 266 | 266 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 157 | 2048 | 1 | 10 | 149 | 149 | 272 | 272 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 158 | 2048 | 1 | 13 | 149 | 149 | 278 | 278 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 159 | 2048 | 1 | 16 | 149 | 149 | 284 | 284 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 160 | 2048 | 1 | 19 | 149 | 149 | 290 | 290 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 161 | 2048 | 1 | 22 | 149 | 149 | 296 | 296 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 162 | 2048 | 1 | 25 | 149 | 149 | 302 | 302 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 163 | 2048 | 1 | 28 | 149 | 149 | 308 | 308 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 164 | 2048 | 1 | 31 | 149 | 149 | 314 | 314 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 165 | 2048 | 1 | 34 | 149 | 149 | 320 | 320 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 166 | 2048 | 1 | 37 | 149 | 149 | 326 | 326 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 167 | 2048 | 1 | 40 | 149 | 149 | 332 | 332 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 168 | 2048 | 1 | 43 | 149 | 149 | 338 | 338 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 169 | 2048 | 1 | 46 | 149 | 149 | 344 | 344 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 170 | 2048 | 1 | 49 | 149 | 149 | 350 | 350 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 171 | 2048 | 2 | 1 | 149 | 149 | 294 | 294 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 172 | 2048 | 2 | 4 | 149 | 149 | 300 | 300 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 173 | 2048 | 2 | 7 | 149 | 149 | 306 | 306 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 174 | 2048 | 2 | 10 | 149 | 149 | 312 | 312 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 175 | 2048 | 2 | 13 | 149 | 149 | 318 | 318 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 176 | 2048 | 2 | 16 | 149 | 149 | 324 | 324 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 177 | 2048 | 2 | 19 | 149 | 149 | 330 | 330 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 178 | 2048 | 2 | 22 | 149 | 149 | 336 | 336 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 179 | 2048 | 2 | 25 | 149 | 149 | 342 | 342 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 180 | 2048 | 2 | 28 | 149 | 149 | 348 | 348 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 181 | 2048 | 2 | 31 | 149 | 149 | 354 | 354 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 182 | 2048 | 2 | 34 | 149 | 149 | 360 | 360 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 183 | 2048 | 2 | 37 | 149 | 149 | 366 | 366 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 184 | 2048 | 2 | 40 | 149 | 149 | 372 | 372 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 185 | 2048 | 2 | 43 | 149 | 149 | 378 | 378 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 186 | 2048 | 2 | 46 | 149 | 149 | 384 | 384 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 187 | 2048 | 2 | 49 | 149 | 149 | 390 | 390 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 188 | 2048 | 4 | 1 | 149 | 149 | 374 | 374 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 189 | 2048 | 4 | 4 | 149 | 149 | 380 | 380 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 190 | 2048 | 4 | 7 | 149 | 149 | 386 | 386 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 191 | 2048 | 4 | 10 | 149 | 149 | 392 | 392 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 192 | 2048 | 4 | 13 | 149 | 149 | 398 | 398 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 193 | 2048 | 4 | 16 | 149 | 149 | 404 | 404 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 194 | 2048 | 4 | 19 | 149 | 149 | 410 | 410 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 195 | 2048 | 4 | 22 | 149 | 149 | 416 | 416 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 196 | 2048 | 4 | 25 | 149 | 149 | 422 | 422 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 197 | 2048 | 4 | 28 | 149 | 149 | 428 | 428 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 198 | 2048 | 4 | 31 | 149 | 149 | 434 | 434 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 199 | 2048 | 4 | 34 | 149 | 149 | 440 | 440 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 200 | 2048 | 4 | 37 | 149 | 149 | 446 | 446 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 201 | 2048 | 4 | 40 | 149 | 149 | 452 | 452 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 202 | 2048 | 4 | 43 | 149 | 149 | 458 | 458 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 203 | 2048 | 4 | 46 | 149 | 149 | 464 | 464 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 204 | 2048 | 4 | 49 | 149 | 149 | 470 | 470 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 205 | 4096 | 1 | 1 | 149 | 149 | 374 | 374 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 206 | 4096 | 1 | 4 | 149 | 149 | 380 | 380 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 207 | 4096 | 1 | 7 | 149 | 149 | 386 | 386 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 208 | 4096 | 1 | 10 | 149 | 149 | 392 | 392 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 209 | 4096 | 1 | 13 | 149 | 149 | 398 | 398 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 210 | 4096 | 1 | 16 | 149 | 149 | 404 | 404 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 211 | 4096 | 1 | 19 | 149 | 149 | 410 | 410 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 212 | 4096 | 1 | 22 | 149 | 149 | 416 | 416 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 213 | 4096 | 1 | 25 | 149 | 149 | 422 | 422 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 214 | 4096 | 1 | 28 | 149 | 149 | 428 | 428 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 215 | 4096 | 1 | 31 | 149 | 149 | 434 | 434 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 216 | 4096 | 1 | 34 | 149 | 149 | 440 | 440 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 217 | 4096 | 1 | 37 | 149 | 149 | 446 | 446 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 218 | 4096 | 1 | 40 | 149 | 149 | 452 | 452 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 219 | 4096 | 1 | 43 | 149 | 149 | 458 | 458 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 220 | 4096 | 1 | 46 | 149 | 149 | 464 | 464 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 221 | 4096 | 1 | 49 | 149 | 149 | 470 | 470 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 222 | 4096 | 2 | 1 | 149 | 149 | 414 | 414 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 223 | 4096 | 2 | 4 | 149 | 149 | 420 | 420 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 224 | 4096 | 2 | 7 | 149 | 149 | 426 | 426 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 225 | 4096 | 2 | 10 | 149 | 149 | 432 | 432 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 226 | 4096 | 2 | 13 | 149 | 149 | 438 | 438 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 227 | 4096 | 2 | 16 | 149 | 149 | 444 | 444 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 228 | 4096 | 2 | 19 | 149 | 149 | 450 | 450 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 229 | 4096 | 2 | 22 | 149 | 149 | 456 | 456 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 230 | 4096 | 2 | 25 | 149 | 149 | 462 | 462 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 231 | 4096 | 2 | 28 | 149 | 149 | 468 | 468 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 232 | 4096 | 2 | 31 | 149 | 149 | 474 | 474 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 233 | 4096 | 2 | 34 | 149 | 149 | 480 | 480 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 234 | 4096 | 2 | 37 | 149 | 149 | 486 | 486 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 235 | 4096 | 2 | 40 | 149 | 149 | 492 | 492 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 236 | 4096 | 2 | 43 | 149 | 149 | 498 | 498 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 237 | 4096 | 2 | 46 | 149 | 149 | 504 | 504 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 238 | 4096 | 2 | 49 | 149 | 149 | 510 | 510 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 239 | 4096 | 4 | 1 | 149 | 149 | 494 | 494 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 240 | 4096 | 4 | 4 | 149 | 149 | 500 | 500 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 241 | 4096 | 4 | 7 | 149 | 149 | 506 | 506 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 242 | 4096 | 4 | 10 | 149 | 149 | 512 | 512 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 243 | 4096 | 4 | 13 | 149 | 149 | 518 | 518 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 244 | 4096 | 4 | 16 | 149 | 149 | 524 | 524 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 245 | 4096 | 4 | 19 | 149 | 149 | 530 | 530 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 246 | 4096 | 4 | 22 | 149 | 149 | 536 | 536 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 247 | 4096 | 4 | 25 | 149 | 149 | 542 | 542 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 248 | 4096 | 4 | 28 | 149 | 149 | 548 | 548 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 249 | 4096 | 4 | 31 | 149 | 149 | 554 | 554 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 250 | 4096 | 4 | 34 | 149 | 149 | 560 | 560 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 251 | 4096 | 4 | 37 | 149 | 149 | 566 | 566 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 252 | 4096 | 4 | 40 | 149 | 149 | 572 | 572 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 253 | 4096 | 4 | 43 | 149 | 149 | 578 | 578 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 254 | 4096 | 4 | 46 | 149 | 149 | 584 | 584 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |
| 255 | 4096 | 4 | 49 | 149 | 149 | 590 | 590 | 149 (+60/GB, +40/vCPU, +2/GB) | 149 | = |

**Verificarea formulei pe toate cele 255 de rânduri:** 0 nepotriviri între `unitAmount` returnat live și

```text
149 + ((ram - 256)/1024)*60 + max(0, cpu-1)*40 + max(0, disk-1)*2
```

`VERIFIED` (255/255)

---

## 4. Cele patru produse care nu pot fi comandate

| produs | `eggId` | `dockerImage` | `deployable` | oferă configurații în wizard? | poate fi comandat prin API? |
|---|:--:|:--:|:--:|:--:|:--:|
| `wordpress` | — | — | nu | **nu** | nu — `400 bad_request` |
| `code-server` | — | — | nu | **nu** | nu — `400 bad_request` |
| `uptime-kuma` | — | — | nu | **nu** | nu — `400 bad_request` |
| `postgresql` | — | — | nu | **nu** | nu — `400 bad_request` |

`VERIFIED` (DB: `eggId` și `dockerImage` null; live: cele 4 răspunsuri `400`)

Consecință pentru matrice: **singurul produs cu preț real este `discord-bot`**, iar singurul produs cu configurații oferite de wizard este tot `discord-bot`. Celelalte patru rânduri ale matricei au valoare de afișare, dar zero configurații și zero posibilitate de comandă.

---

## 5. Întrebările briefing-ului, per produs

### 5.1 Prețul minim afișat clientului este prețul cu care va fi taxat pentru configurația minimă?

| produs | preț minim afișat | configurația minimă | prețul motorului pentru configurația minimă | egal? | observație |
|---|---:|---|---:|:--:|---|
| `discord-bot` | 149 (€1.49) | 256 MB / 1 vCPU / 1 GB | 149 (€1.49) | **da** | prețul afișat e prețul minimului, nu prețul implicitului |
| `wordpress` | 149 (€1.49) | 512 MB / 1 vCPU / 5 GB | 149 (€1.49) | **da** | dar nu poate fi comandat |
| `code-server` | 299 (€2.99) | 1024 MB / 1 vCPU / 5 GB | 299 (€2.99) | **da** | dar nu poate fi comandat |
| `uptime-kuma` | 149 (€1.49) | 256 MB / 1 vCPU / 5 GB | 149 (€1.49) | **da** | dar nu poate fi comandat |
| `postgresql` | 449 (€4.49) | 1024 MB / 1 vCPU / 5 GB | 449 (€4.49) | **da** | dar nu poate fi comandat |

Motivul pentru care egalitatea este exactă: `baseAmount` este definit ca „Amount for the minimum configuration, in minor units" (`api/prisma/schema.prisma:264-265`), iar supraclășugile se aplică doar peste minim (`api/src/services/pricing.ts:45-50`). Deci prețul minim al catalogului **este** prețul configurației minime, prin construcție.

**Pentru produsul vândut, `discord-bot`:**
- prețul minim afișat în catalog = **€1.49** (configurația 256 MB / 1 vCPU / 1 GB),
- prețul **implicit** (512 MB / 1 vCPU / 5 GB, cu care pornește wizard-ul) = **€1.72**,
- prețul maxim oferit (4096 MB / 4 vCPU / 49 GB) = **€5.90**.

### 5.2 Poate un client construi o configurație care costă mai mult decât i-a fost cotat?

**Nu, prin calea de comandă.** Motivele, fiecare cu sursa:

1. Clientul trimite `items` (slug + ram + cpu + disk); serverul recalculează prețul de la zero cu `priceItems()` (`api/src/services/pricing.ts:91-134`) și **nu** acceptă nicio sumă din payload. `OrderItem.unitAmount` este scris din calculul serverului (`api/src/routes/orders.ts:84-90`).
2. `validateConfiguration` (`pricing.ts:55-67`) respinge orice valoare în afara intervalului produsului.
3. Clientul nu poate manipula `total`: `Order.total = quote.total` (`orders.ts:79`), iar `quote` vine din `buildQuote` (`pricing.ts:299-331`).

**Cele trei excepții reale, toate în sens opus unei supra-taxări:**

| # | Situație | Efect | Clasă |
|---|---|---|---|
| E1 | **Promoție aplicată**: clientul vede suma redusă, iar Stripe ar încasa suma **neredusă** (și, mai rău, comanda eșuează la `verifyAmount`) | clientul e taxat **mai mult** decât a fost cotat | `CODE-INSPECTED` — `stripe.ts:175` vs `orders.ts:79` vs `webhooks.ts:192` |
| E2 | **Instanță importată** (`POST /admin/instances/import`): prețul stocat este `baseAmount` (149) în loc de prețul configurației (172) | estimarea lunară a clientului e **mai mică** cu 23 minor units; nu e supra-taxare | `CODE-INSPECTED` + `VERIFIED` (DB) |
| E3 | **Simulatorul de marketing** (`web/src/home/Studio.tsx`, `web/src/home/Story.tsx`) calculează prețuri în browser, din cardul ilustrativ | prețuri afișate pentru 7 produse care **nu există** în catalog; nu ajung într-o comandă | `CODE-INSPECTED` |

**Nicio configurație reachable prin wizard nu poate fi mai scumpă decât cotată: 0 excepții pe această direcție.**

**O observație de suprafață API:** API-ul acceptă și prețuiește configurații pe care wizard-ul nu le oferă (de exemplu 4096 MB / 2 vCPU / 20 GB — validă, pentru că `validateConfiguration` verifică doar intervalul). Prețul e consistent, deci nu e o problemă de tarifare; este însă un fapt relevant pentru comparația cu game hosting (§8).

---

## 6. Auditul etichetelor „Starting price"

Cerința: eticheta să fie prezentă **oriunde** apare minimul și să nu fie folosită niciodată pentru un preț care nu e minimul.

| suprafață | fișă:linie | text | prețul afișat | verdict |
|---|---|---|---|---|
| Catalogul din aplicație | `web/src/app/DeployCatalog.tsx:108-111` | „Starting price. You choose the resources on the next screen." | `price.amount` = 149 | **corect** — eticheta prezentă, prețul e minimul |
| Pagina produsului | `web/src/app/ProductPage.tsx:167-172` | „Starting price. The resources are chosen on the next screen." | `price.amount` = 149 | **corect** |
| Wizard de deploy | `web/src/app/Deploy.tsx:526-534` | „The price of the smallest configuration is {149}. The amount above is the price of the configuration you chose." | minimul | **corect** — formulare diferită, dar mai explicită: separă minimul de configurația aleasă |
| Catalogul de pe site | `web/src/home/Catalog.tsx:85` + `:166-167` | „Every app shows its starting price up front." + pe card „Min. 256 MB · 1 GB disk" lângă sumă | minimul | **corect** — eticheta e în proză, iar cardul arată explicit minimul de resurse |
| Hero (site) | `web/src/home/Hero.tsx:65` | „Apps from €1.49/mo · Databases from €4.49/mo" | `minAppPrice` / `minDatabasePrice` | **corect** — „from" |
| Secțiunea de prețuri (site) | `web/src/home/Rest.tsx:13` | „{price} /mo from" | minimul | **corect** |
| Autentificare / înregistrare | `web/src/pages/Login.tsx:129-131`, `Register.tsx:42-44`, `ResetPassword.tsx:39-41`, `VerifyEmail.tsx:23-25`, `ForgotPassword.tsx:21-23` | „Apps from {minAppPrice}/mo", „Databases from {minDatabasePrice}/mo" | minimul | **corect** |
| Documentație | `web/src/pages/Docs.tsx:169`, `:1118-1119` | „The price shown is the catalog starting price for the smallest configuration." | minimul | **corect** |
| Simulator (marketing) | `web/src/home/Studio.tsx:225` | „Simulated preview. Nothing is created or billed. Prices are illustrative." | card ilustrativ | **corect etichetat** — dar 7 dintre cele 12 aplicații nu există în catalog |
| Scenă de storytelling | `web/src/home/Story.tsx:25` | „from {eur(a.from)}" | card ilustrativ | **lipsă etichetă** — pagină publică, fără disclaimer, cu „Ghost", „n8n", „Forgejo" și prețuri de la care nu se vinde nimic |
| Admin — prețuri | `web/src/admin/Pricing.tsx:44,94-97` | „Base price for the minimum configuration plus the rate for every extra gigabyte…" | card de tarife | **corect** — suprafață de operator |
| Admin — produse | `web/src/admin/Products.tsx:111-113,168-170,252-253` | „Base price" | `baseAmount` | **corect** — suprafață de operator |

**Verificarea inversă (baza prezentată vreodată ca preț al configurației implicite):** nu se întâmplă nicăieri. Wizard-ul pornește de la `defaultRam/defaultCpu/defaultDisk` (512/1/5 = **172**) și afișează separat „The price of the smallest configuration is €1.49" (`Deploy.tsx:526-534`). Pagina produsului spune explicit „The resources are chosen on the next screen." Siteul spune „from". **Nicio suprafață nu prezintă 149 ca preț al configurației implicite.**

**Două decalaje de etichetare, ambele în direcția „mai puțin vizibil", nu „preț greșit":**

- **L1** — `web/src/home/Catalog.tsx:106-108`: cardurile „featured" arată suma **fără nicio etichetă pe card**; eticheta se află două paragrafe mai sus, la linia 85. Cardurile din grilă (`:166-167`) compensează cu „Min. 256 MB · 1 GB disk". `CODE-INSPECTED`
- **L2** — `web/src/home/Story.tsx:8,25`: pagină publică care listează „Ghost", „n8n", „Forgejo" cu „from €1.99 / €2.99 / €2.49", fără niciun disclaimer, în timp ce `web/src/data.ts:8-17` spune explicit „Never present an amount or an app from this list as the offer of the platform." `CODE-INSPECTED`

---

## 7. Prețul stocat și configurația reală (rând în matrice)

Acest rând nu este o comparație de șase prețuri, ci o **a șaptea dimensiune**: prețul pe care clientul îl vede în panou este o valoare **stocată**, nu una recalculată.

| dimensiune | produs / instanță | resurse | preț stocat | preț recalculat de motor | diferență | unde se naște | clasă |
|---|---|---|---:|---:|---:|---|---|
| **P1** | `discord-bot` / instanța importată (`cmvkn67g90003psd841h9qc3g`, cont `browser-customer@blipmade.test`, fără `orderId`) | 512 MB / 1 vCPU / 5 GB | **149** | **172** | **−23** (€0.23/lună) | `POST /admin/instances/import` → `price: price?.baseAmount ?? 0` (`api/src/routes/admin.ts:912`) | `VERIFIED` (DB) + `CODE-INSPECTED` |
| **P2** | `discord-bot` / instanța din `BM-00002` (`cmvkbgm9h0001r18096ep5jzl`) | 512 MB / 1 vCPU / 5 GB | 172 | 172 | 0 | `webhooks.ts:162` — `price: item.unitAmount` | `VERIFIED` (DB) |
| **P3** | `discord-bot` / instanța din `BM-00003` (`cmvkbichh0003r180pj33xwom`) | 512 MB / 1 vCPU / 5 GB | 172 | 172 | 0 | `webhooks.ts:162` | `VERIFIED` (DB) |

**P1 este singura abatere reală.** Mecanismul ei:

```text
api/src/routes/admin.ts:901-916
ram: server.limits.memory, cpu: …, disk: …      ← resursele REALE ale serverului importat
price: price?.baseAmount ?? 0                    ← prețul MINIMULUI produsului, oricare ar fi configurația
```

Importul copiază resursele reale de la panou, dar scrie prețul configurației **minime**. Pentru un server importat cu 512 MB / 1 vCPU / 5 GB, prețul corect este 172, iar importul scrie 149.

**Cine poate ajunge în această stare prin produsul însuși?** Niciun client. Am urmărit toate căile care schimbă `ram`/`cpu`/`disk`:

| cale | schimbă resursele? | recalculează prețul? |
|---|---|---|
| `PATCH /instances/:id/settings` (`api/src/routes/instance-server.ts:972-1005`) | nu (doar `name`, `description`) | n/a |
| `PUT /instances/:id/resources`, upgrade plătit (`api/src/routes/instances.ts:296-311`) | da, după plată | **da** (`api/src/services/upgrades.ts:172-175`) |
| `PUT /instances/:id/resources`, downgrade (`api/src/routes/instances.ts:278-293`) | da, imediat | **da** (`upgrades.ts:174`) |
| creare la provisionare (`api/src/routes/webhooks.ts:151-166`) | da | **da** (`webhooks.ts:162`) |
| `api/src/services/provisioning.ts` | nu | nu scrie prețul deloc |
| `POST /admin/instances/:id/retry` (`api/src/routes/admin.ts:845-858`) | nu | nu |
| **`POST /admin/instances/import`** (`api/src/routes/admin.ts:864-931`) | **da** | **nu** → **P1** |
| panoul Pterodactyl / `panel-bridge` | limitele se stabilesc la creare (`provisioning.ts:466-481`); bridge-ul nu atinge alocările | n/a |

**Așadar: abaterea este produsă exclusiv de o acțiune de operator, nu de un client, și este în favoarea clientului (preț mai mic decât datorat), nu în defavoarea lui.** Niciun client nu poate reduce resursele fără ca prețul să urmeze: calea de downgrade scrie întotdeauna `price: newPrice` recalculat.

**Nu există reconciliere programată.** Job-urile worker-ului (`api/src/worker.ts:164-169`) sunt: `reconcile()` (provisionare), `pruneQueue()`, `pruneSessions()`, `sweepBilling()` (subscriptii + rezervări de promoție), `retryWebhooks()`. **Niciunul nu compară `instance.price` cu `priceConfiguration(price, product, instance)`.** `CODE-INSPECTED`

**Cine vede abaterea:**

- clientul: `GET /billing/summary` → `monthlyEstimate = Σ instance.price` (`api/src/routes/billing.ts:116`) → estimarea lunară e **under-reportată cu 23 minor units** pentru instanța importată. `CODE-INSPECTED`
- operatorul: ecranul de servicii arată `service.price` **lângă** `ram / cpu / disk` (`web/src/admin/Services.tsx:109,199-201,252-254`), deci abaterea e vizibilă, dar **fără niciun semnal, fără coloană „calculat", fără alertă**. Ecranul `web/src/admin/Pricing.tsx` nu arată deloc prețurile instanțelor. `CODE-INSPECTED`

**Corectiv propus:** (a) `POST /admin/instances/import` să folosească `priceConfiguration(price, product, {ram,cpu,disk})` în loc de `baseAmount`; (b) un job zilnic în `sweepBilling()` care recalculează prețul fiecărei instanțe și emite `audit('instance.price_mismatch')`; (c) în `web/src/admin/Services.tsx`, o coloană cu prețul recalculat lângă cel stocat.

---

## 8. Prețul produsului vândut, în formula platformei

### 8.1 Cardul de tarife al produsului vândut (`discord-bot`)

```text
baseAmount  = 149 minor units = €1.49   (prețul configurației minime: 256 MB / 1 vCPU / 1 GB)
ramPerGb    =  60 minor units = €0.60   per GB de RAM  peste minimul de 256 MB
cpuPerUnit  =  40 minor units = €0.40   per unitate de vCPU peste minimul de 1
diskPerGb   =   2 minor units = €0.02   per GB de disc peste minimul de 1 GB
```

`VERIFIED` (DB: `"ProductPrice"` pentru `discord-bot`; `api/prisma/schema.prisma:259-273` pentru semnificația câmpurilor)

### 8.2 Formula

```text
price(MB, vCPU, GB) = 149
                    + max(0, (MB - 256)/1024) × 60
                    + max(0, vCPU - 1)    × 40
                    + max(0, GB - 1)      × 2
```

`api/src/services/pricing.ts:39-53`

### 8.3 Configurația de referință pentru un server de joc real: 4 GB / 2 vCPU / 20 GB

```text
MB = 4096, vCPU = 2, GB = 20

extra RAM   = (4096 - 256)/1024 = 3.75 GB   → 3.75 × 60 = 225
extra CPU   = 2 - 1 = 1                    → 1 × 40    =  40
extra disk  = 20 - 1 = 19 GB               → 19 × 2    =  38

price = 149 + 225 + 40 + 38 = 452 minor units = €4.52 / lună
```

Verificat live pe API-ul public:

```bash
$ curl -s -X POST https://blipmade.com/api/catalog/quote -H 'content-type: application/json' \
    -d '{"items":[{"productSlug":"discord-bot","ram":4096,"cpu":2,"disk":20}]}'
{"items":[{...,"unitAmount":452,...}],"subtotal":452,"discount":0,"total":452,"currency":"EUR"}
```

`VERIFIED` (live)

### 8.4 Atenție: această configurație **nu este selectabilă în wizard**

Pasul de disc este 3 (vezi §1), deci 20 GB nu apare în lista de opțiuni. Cele mai apropiate configurații **selectabile** cu 4 GB și 2 vCPU:

| configurație | preț | selectabilă în wizard? |
|---|---:|:--:|
| 4096 MB / 2 vCPU / 19 GB | **450** (€4.50) | da |
| 4096 MB / 2 vCPU / 22 GB | **456** (€4.56) | da |
| 4096 MB / 2 vCPU / 20 GB | **452** (€4.52) | **nu** (se poate obține doar prin API) |

**Nu am inventat prețuri de concurență și nu am estimat marje** — compararea cu game hosting îi revine agentului de produs / CFO. Numărul de mai sus este cel al platformei, calculat cu motorul ei.

### 8.5 Context pentru CFO

| mărime | preț platformă |
|---|---:|
| minimul selectabil (256 MB / 1 vCPU / 1 GB) | €1.49 |
| implicitul (512 MB / 1 vCPU / 5 GB) | €1.72 |
| 4 GB / 2 vCPU / 20 GB (referință „game server") | €4.52 |
| maximul selectabil (4096 MB / 4 vCPU / 49 GB) | €5.90 |

**Atenție la baseline-ul din briefing:** secțiunea 12.3 a briefing-ului spune „€2.29 per month" pentru configurația 512 MB / 1 vCPU / 5 GB, calculat ca `149 + 60×0.5 + 40×1 + 2×5` — adică aplicând supraclășugile **peste zero**. Motorul platformei le aplică **peste minimul produsului** (`minRam=256`, `minCpu=1`, `minDisk=1`), deci prețul real al acelei configurații este **172 = €1.72**, iar prețul minimului este **149 = €1.49**. Baseline-ul briefing-ului e cu **33%** mai mare decât prețul implicit real și cu **54%** mai mare decât prețul minim real. `VERIFIED` (formula + 255 de cote live + 5 ordine reale în DB)

**Poziția comercială, spusă fără adjective:** panoul de pe `games-node-01` (120 GiB RAM, 800 GiB disc, 173 alocări libere, ouă Minecraft / CS:GO / Rust / Mumble / TeamSpeak gata de instalat) este o instalație de **game hosting**, iar magazinul vinde **un singur bot Node.js la €1.49–€1.72 pe lună**, plus patru produse care nu pot fi comandate. Pentru un server de joc real (4 GB / 2 vCPU / 20 GB) prețul platformei este **€4.52/lună** — cel mai apropiat de comparația cu game hosting.

---

## 9. Rezumatul inconsistențelor

### 9.1 Inconsistențe de tarifare între cele șase prețuri: **0**

Toate cele 5 produse și toate cele 255 de configurații oferite de wizard au aceleași prețuri în cele șase surse. Serverul decide, browserul afișează.

### 9.2 Abateri găsite în afara celor șase coloane: **4**

| # | abatere | unde | direcție | clasă |
|---|---|---|---|---|
| A1 | Prețul stocat al unei instanțe importată ≠ prețul configurației sale (149 vs 172) | `api/src/routes/admin.ts:912` | sub-reportare pentru client | `VERIFIED` (DB) |
| A2 | Reducerea de promoție nu ajunge la Stripe: clientul e cotat cu suma redusă și ar fi taxat cu cea neredusă | `api/src/services/stripe.ts:175` vs `api/src/routes/orders.ts:79` | supra-taxare | `CODE-INSPECTED` |
| A3 | Cardul ilustrativ de marketing (`web/src/data.ts`) are `disk` minim 5 pentru `discord-bot`, în timp ce produsul real are `minDisk = 1` → simulatorul arată €1.49 pentru 256/1/5, în timp ce motorul real cere €1.57 | `web/src/data.ts:26` vs `api/prisma/schema.prisma` (`minDisk=1`) | sub-reportare, doar în simulator | `CODE-INSPECTED` |
| A4 | `maxDisk = 50` nu este atins: pasul de disc al wizard-ului este 3, deci maximul selectabil e 49 GB, iar 20 GB nu e selectabil | `web/src/app/Deploy.tsx:161-168` | spațiu de configurații mai mic decât declarat | `CODE-INSPECTED` + `VERIFIED` (sweep live) |

### 9.3 Abateri de etichetă: **2** (L1, L2 în §6)

Niciuna nu prezintă un preț greșit; ambele sunt probleme de vizibilitate a etichetei „starting", în plusul unui disclaimer lipsă pe `home/Story.tsx` pentru 7 produse care nu există în catalog.

### 9.4 Decalaje de suprafață care trebuie ținute minte

- Catalogul și API-ul expun **cardul de tarife**, nu prețul configurației; prețul pe configurație apare doar în cotă.
- `GET /billing/summary` este singurul preț pe care clientul îl vede fără o cotă nouă, și el este **suma unor valori stocate** (`api/src/routes/billing.ts:116`).
- Prețul afișat ca „Starting price" este **minimul**, nu implicitul; diferența dintre ele (€1.49 vs €1.72 pentru `discord-bot`) trebuie să rămână vizibilă în comunicare.

---

## 10. Ce n-am putut verifica

| Subiect | Status | Motiv | Pasul de deblocare sigur |
|---|---|---|---|
| Prețul cu care ar fi încasat Stripe o comandă cu promoție | `BLOCKED` | Nu există cheie Stripe; checkout-ul răspunde 503 | Cont Stripe **de test**, în afara producției, plus o promoție locală |
| Dacă prețul afișat = prețul încasat după taxe | `BLOCKED` | Nu există logică de taxă în cod și nu există decizie fiscală | Decizia CFO-ului, apoi `automatic_tax` + ramură `tax` |
| Prețul cu care ar fi încasat o comandă reală, end-to-end | `BLOCKED` | Nu se poate plăti | Stack local + cheie de test Stripe |
