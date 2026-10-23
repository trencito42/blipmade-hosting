# 17 — Prompt de implementare pentru următoarea rundă

Acesta e promptul de pornire pentru agentul care va executa prima undă de remedieri. E scris ca să poată fi dat **ca atare**, fără context suplimentar.

---

## Prompt

> Lucrezi la platforma Blipmade — găzduire de servere de joc și aplicații, repo `trencito42/blipmade-hosting`, producție la `blipmade.com`. Auditul tehnic și comercial complet e în `audit/` (43 de rapoarte). **Citește întâi, în această ordine:**
>
> 1. `audit/00-BRIEFING.md` — contextul comun, regulile, clasele de verificare
> 2. `audit/00-EXECUTIVE-SUMMARY.md` — verdictul și răspunsurile la cele 25 de întrebări
> 3. `audit/16-GO-NO-GO-DECISION.md` — cele 13 condiții care inversează verdictul
> 4. `audit/13-PRIORITIZED-BACKLOG.md` — cele 23 de P0, cu efort, dependențe și criteriu de verificare
> 5. `audit/12-FULL-FINDINGS-REGISTER.md` — registrul complet, cu dovezile
>
> **Misiunea ta: execută Unda 0 și Unda 1 din roadmap** (`audit/14-30-60-90-DAY-ROADMAP.md` §5) — deblocările și siguranța plății. Concret:
>
> - **Unda 0** (fără schimbare de cod): cheie Stripe de **test** într-un mediu de test separat de producție; relay SMTP; țintă de backup off-host; cheie de audit read-only pe VM 100 și VM 101 + pornirea QEMU guest agent pe nod; rularea lui `POST /admin/infrastructure/sync`; **firewall pe hipervisor, VM 102 și VM 103**; **rotația parolei de `root`** (doar după firewall, altfel e lockout).
> - **Unda 1** (~5 zile, în ordine strictă): `B-01` poarta de capacitate a discului (`provisioning.ts:214` — MB vs GB) → `B-02` compensație la eșec (server șters, alocare eliberată, refund) → `B-03` reducerea ajunge la Stripe (`stripe.ts:175` vs `orders.ts:79` vs `webhooks.ts:192`) → `B-04` prețul stocat = prețul configurației (`admin.ts:912`) → `B-16` `renew()` nu mai fabrică facturi `PAID` + reconciliere cu Stripe → `B-17` fereastra de server dublu închisă + numerotare atomică a comenzilor.
>
> **Reguli dure:**
> - **Nu atingi producția fără o copie și un plan de rollback.** Fiecare schimbare merge întâi într-un mediu de test, apoi în staging, apoi în producție.
> - **Nu schimbi prețurile, catalogul public, nici copy-ul de marketing** în această rundă. Prețul e o decizie a operatorului (D-1 din backlog) și depinde de valoarea reală a lui `C_node`.
> - **Nu rebranduiești și nu republici nimic.**
> - **Fiecare schimbare se încheie cu un criteriu de verificare** — copiază-l din coloana „Cum se verifică" a backlog-ului. Fără criteriu de verificare, schimbarea nu e terminată.
> - **Nu inventa date.** Dacă o valoare nu e cunoscută (factura de server, comisioanele Stripe reale, prețul de backup), e `OPERATOR-INPUT` și se cere, nu se estimеază.
> - **Nu publica secretele.** Doar tipul și locația.
> - **Nu șterge date ale clienților.** Ștergerile se fac doar printr-un mecanism cu termen și export, aprobat explicit.
>
> **La final, predă:** lista de schimbări cu fișierele și liniile, criteriile de verificare fiecare cu rezultatul, ce a rămas neimplementat și de ce, plus ce decizii de operator (D-1 … D-4) încă blochează.

---

## Ce vine după Unda 1

| Undă | Conținut | Rânduri |
|---|---|---|
| **Unda 2** | Produsul vândut: `B-74` există o aplicație în container → `B-75` provisionare condiționată de plată → `B-06` catalog → `B-07` stare reală → `B-08` limite → `B-05` chei Stripe live → `B-77`/`B-78` URL public | 7 |
| **Unda 2b** | Canalul de suport: `B-76` | 1 |
| **Unda 3** | Date și securitate: `B-09` backup + drill → `B-10` RAID 1 → `B-13` firewall → `B-14` rotație → `B-15` TLS/HSTS/CSP | 4 |
| **Unda 4** | Adevărul comercial: `B-18` … `B-23`, `B-42` cardul de preț | 6 |
| **Unda 5** | Închiderea porților: `B-11`, `B-12`, `B-24` … `B-37` + **cele 20 de rulări consecutive** + **drill-ul de restaurare** | 15 |

---

## Cele 4 decizii care nu sunt ale tale

Înainte să începi Unda 1, verifică dacă operatorul a răspuns. Fără răspuns, poți face Unda 1, dar **nu poți trece de Unda 3**.

| # | Decizie | Ce e nevoie | Ce blochează |
|---|---|---|---|
| **D-1** | Prețul de lansare | Valoarea reală a `C_node` (factura de server) și decizia asupra cardului | `B-42`, modelul economic, scenariul B |
| **D-2** | Ținta de backup | Provider, volum, cost | `B-09`, poarta 9 |
| **D-3** | Accesul la VM 100 și VM 101 | Cheie de audit + QEMU guest agent | 19 afirmații `unverifiable`, poarta 7 |
| **D-4** | Statutul comercial și termenii | Confirmarea celor trei adrese românești de la SEC-01; regimul juridic și fiscal | Citirea corectă a SEC-01; conformitate |

---

## Cum verifici că ai terminat

```bash
# 1. Baza de test e izolată de producție
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && bash scripts/run-tests.sh'
#    așteptat: 240/240 (219 API + 21 web)

# 2. Containerele sunt sănătoase și rutele publice răspund
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'docker ps --format "{{.Names}} {{.Status}}"'
for u in / /app/instances /api/health /api/catalog/products; do
  printf '%-24s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://blipmade.com$u)"
done

# 3. Poarta de capacitate e corectată: o instanță peste capacitate e respinsă
#    (test automat, nu test manual)

# 4. Provisionarea e fiabilă: 20 de rulări consecutive, toate reușite, 0 servere orfane
#    (script de test, cu o singură autentificare)

# 5. Firewallul e efectiv
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'ss -lntp' | grep -E ':8006|:111' && echo 'NEVERIFICAT' || echo 'OK: porturile de administrare nu mai sunt ascultate public'

# 6. Backupul e programat și există o copie off-host, cu un drill de restaurare reușit
```

**Regula finală:** dacă nu poți rula o verificare, **nu e terminat**. Nu „aproape terminat".

---

## Ce NU trebuie făcut în această rundă

- Nu se schimbă prețurile — e decizia D-1.
- Nu se adaugă produse noi în catalog.
- Nu se extinde portofoliul — niciun produs nou nu intră înainte ca precedentul să treacă de 20 de rulări consecutive.
- Nu se rulează nicio campanie cu reducere — `B-03` trebuie să fie în producție întâi.
- Nu se repară P2/P3 — sunt în backlog, dar nu în drumul critic.
- Nu se creează niciun client, nicio comandă, nicio plată reală în producție în timpul testării.
