# Verificări independente ale lead-ului asupra constatărilor din rapoarte

Acest document reprezintă o a doua opinie, făcută de lead după primirea celor șase
rapoarte ale rundei. Fiecare afirmație de mai jos a fost verificată **direct în codul
de pe ramura `main` @ `2e1e78a`**, care este și codul rulat în producție.

Scopul este explicit: cele patru rapoarte au fost scrise de agenți independenți, iar
două dintre ele se contrazic pe aceleași constatări. Fără această a doua privire,
sinteza ar fi moștenit erori de verificare.

---

## V1. `ADM-01` (din `PREVIOUS-FINDINGS-REVALIDATION.md`) — **INVALID FINDING**

Raportul de revalidare afirmă, la §5.4 și în matricea §4.9:

> „`api/src/routes/tickets.ts` — `grep requirePermission` → **0 potriviri**; rutele
> folosesc `requireAuth` / `requireStaff` (`:409`), fără `tickets.read`/`tickets.write`"

Verificarea arată că verificarea **există**, cu alt nume:

| Locație | Cod | Ce face |
|---|---|---|
| `api/src/routes/tickets.ts:408` | `app.post('/tickets/:id/status', ...)` | cere `requireStaff(request)` **și** `requireTicketPermission(user, 'tickets.write')` |
| `api/src/routes/tickets.ts:441-449` | `function requireTicketPermission(user, permission)` | pentru `STAFF`/`ADMIN` verifică `hasPermission(...)` și aruncă `forbidden` |
| `api/src/routes/tickets.ts:215, 268, 327, 395` | — | rutele de client verifică proprietatea: `if (ticket.userId !== user.id && !isStaff) throw notFound(...)` |

Greșeala este în metoda de verificare, nu în cod: căutarea s-a făcut după
`requirePermission` (numele helper-ului din `admin.ts`), nu după
`requireTicketPermission` (helper-ul din `tickets.ts`). Concluzia „orice staff poate
muta bilete" **nu este susținută**.

Verdict corect: **`VERIFIED FIXED`**. Severitatea „Critical" atribuită de raport este
nejustificată.

Acest lucru corespunde și rezultatului agentului de audit al panoului de administrare,
care a măsurat refuzul corect pe 39 din 40 de rute.

---

## V2. `ADM-02` (din `PREVIOUS-FINDINGS-REVALIDATION.md`, marcat „VERIFIED FIXED") — **încă defect**

Raportul de revalidare marchează `ADM-02` drept reparat, pe baza liniilor
`api/src/routes/admin.ts:1045-1049`. Acele linii protejează **doar schimbarea rolului**.

Verificarea arată că escaladarea rămâne posibilă:

- `api/src/lib/permissions.ts:2-24` — lista are **21 de permisiuni**.
- `api/src/routes/admin.ts:1059` — singura gardă este
  `if (body.permissions !== undefined && new Set(body.permissions).size >= PERMISSIONS.length && actor.role !== 'ADMIN')`.
  Adică: un angajat care nu este `ADMIN` nu poate授予 **21 din 21**, dar **poate
 送出 20 din 21**.
- În aceeași rută **nu există** nicio comparație între `userId` (ținta) și
  `actor.id` (cel care acționează): un angajat cu `staff.write` își poate rescrie
  **propria** listă de permisiuni.
- `api/src/routes/admin.ts:1053` protejează doar permisiunile unui cont cu rol `ADMIN`.

Rezultatul: un angajat care are doar `staff.write` își poate acorda `customers.write`,
`orders.write`, `services.write`, `settings.write`, `infrastructure.write` — adică
tot ce poate face un administrator, cu excepția unei singure permisiuni.

**Acesta este `ADM-P1-01` din `ADMIN-FUNCTIONALITY.md`. Concluzia agentului de admin
este cea corectă; verdictul de revalidare („VERIFIED FIXED") este greșit.**

Verdict corect: **`STILL BROKEN`**, severitate **High** (escaladare de privilegii
pornită din rolul `STAFF`).

---

## V3. `DR-02` / backup programat — **parțial reparat, prin acțiune, nu prin cod**

Raportul de revalidare afirmă (§7.7) că timerul nu este instalat și citește
`audit/25-OPERATOR-DEPENDENCIES.md` drept afirmație nerealizată. Observația era
corectă în acel moment.

În această sesiune, după ce operatorul a autorizat curățarea și aplicarea ramurii:

- `blipmade-backup.timer` și `blipmade-backup.service` au fost instalate în
  `/etc/systemd/system/` prin `scripts/install-backup-timer.sh`; timerul este `enabled`.
- O rulare manuală a produs `blipmade-scheduled-20261024T001409Z.tar.gz` (59 620
  octeți) împreună cu fișierul `.sha256`.
- `ExecStartPost` (copia în afara gazdei) ieșire 0, dar **`OFFSITE_TARGET` nu este
  setat**: copia **nu părăsește gazda**.

Verdict corect: **programarea există și rulează; backupul în afara gazdei nu există
încă.** `INF-02` / `INF-07` rămân deschise ca dependențe de operator.

---

## V4. `FIN-P2-01` (din `FINANCIAL-INTEGRITY.md`) — **INVALID FINDING**

Raportul financiar afirmă că numerele de factură se calculează cu `count() + 1` și că
două evenimente `invoice.paid` simultane produc o excepție P2002.

Verificarea arată că numerotarea este atomică:

- `api/src/services/billing.ts:635` și `:938` folosesc `await nextInvoiceNumber()`.
- `api/src/services/order-numbers.ts:104-106` — `nextInvoiceNumber()` apelează
  `nextSequenceNumber({ key: INVOICE_SEQUENCE_KEY, prefix: 'BM-INV-', table: 'Invoice' })`.
- `api/src/services/order-numbers.ts:57-80` — contorul este **ridicat într-o singură
  instrucțiune** (`INSERT ... ON CONFLICT` + `UPDATE ... RETURNING`), cu o reparare
  prin `MAX()` doar ca măsură de recuperare pentru un contor deteriorat.

Nu există `count() + 1`. Verdict corect: **`INVALID FINDING`**.

---

## V5. `FIN-P1-01` — **CONFIRMED**

`api/src/services/stripe.ts:279-306`, funcția `markOrderPaid`:

```ts
const alreadyPaid = order.status === 'PAID' || order.status === 'FULFILLED';
...
if (!alreadyPaid) {
  await prisma.order.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: new Date(), ... } });
}
```

Nu există nicio verificare a stării din care se face tranziția. O comandă în
`CANCELLED` sau `REFUNDED` este tratată ca plătibilă: devine `PAID`, consumă
promoția, creează abonamentele și, prin poarta de provisionare, primește
infrastructură. Poarta de plată este corectă, dar poate fi ocolită.

Verdict corect: **`STILL BROKEN`**, severitate **Critical** (ban).

---

## V6. `FIN-P2-03` — **CONFIRMED**, cu mecanismul exact

Raportul financiar afirmă că „o cotare anuală de 1890 produce o comandă de 189".

Mecanismul, verificat în cod:

| Pas | Locație | Ce face |
|---|---|---|
| Cotarea cu perioadă | `api/src/routes/billing.ts:220` | `priceItems(body.items, body.period)` — **onoră perioada**, `ANNUAL` întoarce 1890 |
| Cotarea folosită la comandă | `api/src/routes/orders.ts:71` | `buildQuote(body.items, body.promotionCode, user.id)` — **fără perioadă** |
| ... care ajunge la | `api/src/services/pricing.ts:422` | `priceItems(items)` — implicit `period = 'MONTHLY'` |
| ... și așadar | `api/src/services/pricing.ts:172` | `loadPrice(product.id, period)` cu `MONTHLY` → rândul de preț lunar → **189** |
| Checkout Stripe | `api/src/services/stripe.ts:214` | `recurring: { interval: 'month' }` — **fix, indiferent de perioadă** |

Deci: există două drumuri de cotare cu semantici diferite. Clientul care cotă un
plan anual primește 1890 și, la comandă, este taxat 189. **Suma cotată nu este suma
încasată** — exact inversul promisiunii contractului de preț.

Verdict corect: **`STILL BROKEN`**, severitate **Critical** (ban).

---

## V7. Rezumat

| Constatare | Verdict în raport | Verdict corect | Diferență |
|---|---|---|---|
| `ADM-01` (bilete fără permisiune) | `STILL BROKEN`, Critical | `VERIFIED FIXED` | **raport greșit** — căutare după un alt nume de helper |
| `ADM-02` (escaladare privilegii) | `VERIFIED FIXED` | `STILL BROKEN`, High | **raport greșit** — verifică doar garda de rol, nu garda de permisiuni |
| `DR-02` (backup) | `STILL BROKEN` | programat și rulat; în afara gazdei încă nu | **parțial reparat, prin acțiune** |
| `FIN-P2-01` (numere factură) | `STILL BROKEN`, High | `INVALID FINDING` | **raport greșit** — numerotarea este atomică |
| `FIN-P1-01` (tranziție stare plată) | `STILL BROKEN`, Critical | confirmat | corect |
| `FIN-P2-03` (perioada neglijată) | `STILL BROKEN`, Critical | confirmat, mecanism precizat | corect |

**Două dintre șase verificări ale lead-ului contrazic rapoartele.** Legea este, așadar,
că un raport de audit — oricât de bine documentat — trebuie reverificat înainte de a
deveni baza unei decizii de business.
