# 15 — Checklist de lansare în producție

**Data:** 2026-10-23 · **Baza:** `16-GO-NO-GO-DECISION.md` (19 condiții), `13-PRIORITIZED-BACKLOG.md` (23 P0), `07-release-gates.md` (13 porți).

**Cum se folosește:** bifează fiecare rând **doar după ce ai văzut dovezile**, nu după ce ai modificat codul. Fiecare rând spune **ce dovedire se cere**. Când ai nevoie de o dovadă, comanda e dată în paranteză.

**Regulă:** un rând nebifat e un rând neîndeplinit. Un rând bifat pe baza unei presupuneri e un rând invalid. **19 condiții de la decizia go/no-go + 13 porți de release = 26 de bife care trebuie să fie toate bifate** înainte de lansare.

---

## A. Pre-flight de infrastructură și securitate

| # | Rând | Dovada cerută | ☐ |
|---|---|---|---|
| A1 | Firewall efectiv pe hipervizor | `pve-firewall status` → `running`; `ss -lntp` nu arată `8006` pe `0.0.0.0` | ☐ |
| A2 | `rpcbind` limitat la loopback | `ss -lntp \| grep :111` → `127.0.0.1:111`, nu `0.0.0.0:111` | ☐ |
| A3 | Porturile de administrare nu sunt publice | Din exterior: `nmap -p 8006,111,3128 193.34.214.20` → `filtered` | ☐ |
| A4 | `root` nu se poate autentifica cu parolă | `sshd -T \| grep -E '^(permitrootlogin\|passwordauthentication)'` → `prohibit-password` / `no` | ☐ |
| A5 | Parola de `root` rotată | Autentificare cu parola veche e refuzată | ☐ |
| A6 | Cheia de audit a agentului scoasă din `ps` | `ps auxww` nu arată cheia | ☐ |
| A7 | Cheia de audit prezentă pe VM 100 și VM 101 | `ssh -i <cheie> debian@10.77.0.10` și `...10.77.0.11` reușesc | ☐ |
| A8 | QEMU guest agent pornit pe VM 101 | `qm agent 101 ping` răspunde | ☐ |
| A9 | Starea live a panoului și a nodului, citită | `docker exec blipmade-api-1 node /app/panel-inventory.mjs` — stare, alocări, egg-uri | ☐ |
| A10 | Interfața Proxmox accesibilă doar din VPN | Verificat de pe interfața de management | ☐ |
| A11 | Containere întărite | `docker inspect` — `postgres`/`redis` non-root, `read_only`, `cap_drop: ALL` | ☐ |
| A12 | Antetele de securitate prezente | `curl -I https://blipmade.com` → `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options` | ☐ |
| A13 | TLS intern între containere | Conexiunea API↔DB / API↔Redis nu mai e HTTP simplu | ☐ |
| A14 | Rate limit pe rutele mutante | Un test de sarcină arată 429 la prag | ☐ |
| A15 | Limită de login per cont | 10 încercări pe același cont, de la adrese diferite, se blochează | ☐ |

---

## B. Produsul vândut

| # | Rând | Dovada cerută | ☐ |
|---|---|---|---|
| B1 | **Containerul produsului conține aplicația** | Rădăcina containerului conține `package.json` + punctul de intrare; `npm run start` pornește fără eroare | ☐ |
| B2 | **Aplicația răspunde în interiorul containerului** | Un health-check al aplicației, de pe nod, răspunde 200 | ☐ |
| B3 | **Resursele raportate sunt reale** | `GET /api/instances/:id/resources` → `state: "online"`, `uptime > 0`, `memory_bytes > 0`, în acord cu DB-ul | ☐ |
| B4 | Panoul raportează o stare, nu `None` | Inventarul panoului arată starea fiecărui server | ☐ |
| B5 | Catalogul public listează **doar** produsele reale | `GET /api/catalog/products` → un singur produs cu preț; cele neimplementate nu au preț și nici eticheta „Coming soon" | ☐ |
| B6 | `feature_limits` realiste | `databases` și `backups` fie sunt 0 **și** rutele aferente sunt ascunse, fie sunt > 0 **și** funcționează | ☐ |
| B7 | **Nicio instanță fără plată** | O comandă `AWAITING_PAYMENT` abandonată nu produce instanță și nu ocupă alocare | ☐ |
| B8 | Poarta de capacitate a discului corectată | O instanță cu `disk` peste `freeDisk` e respinsă; unitățile se potrivesc | ☐ |
| B9 | Compensație la provisionare eșuată | Un job eșuat ⇒ fără server, fără alocare, refund executat | ☐ |
| B10 | Fereastra de server dublu închisă | Două rulări simultane ale aceluiași job ⇒ **un** server | ☐ |
| B11 | Numerotarea comenzilor atomică | 100 de comenzi consecutive fără `P2002` | ☐ |
| B12 | Upgrade-ul verifică plata **și** capacitatea | Un upgrade neplătit și un upgrade peste limită sunt ambele refuzate | ☐ |
| B13 | Comanda `UPGRADE` orfană e ștersă | Un checkout eșuat nu lasă `PENDING` cu `total > 0` | ☐ |
| B14 | Starea reală a containerului, sincronizată | Un container oprit se reflectă în UI în cel mult 30 s | ☐ |
| B15 | **Instanța are URL public** | `InstanceDomain` nu mai e gol; URL-ul răspunde | ☐ |
| B16 | Mecanismul de publicare pe Caddy funcțional | Un subdomeniu nou e creat programatic | ☐ |
| B17 | O singură alocare per server — limitare cunoscută | Dacă se vinde Rust/TS3, provisionarea multi-alocare e implementată; altfel, produsele respective nu se vând | ☐ |
| B18 | Porturile de joc publicate | Alocatorul preferă un port ≥ 30000 **și** există un procedeu explicit pentru cazul în care porturile publicate se epuizează | ☐ |

---

## C. Billing și plăți

| # | Rând | Dovada cerută | ☐ |
|---|---|---|---|
| C1 | Cheia Stripe live și `PAYMENTS_ENABLED=true` | `/api/health` → `"stripe": "configured"` | ☐ |
| C2 | **Un checkout real cu plată reală, reușit** | Comandă reală, plată reală, `order.status = PAID` | ☐ |
| C3 | Webhook real acceptat | Evenimentul Stripe procesat, o singură dată (idempotență) | ☐ |
| C4 | Webhook falsificat refuzat | Un payload cu semnătură invalidă → refuzat, cu cod ne-2xx | ☐ |
| C5 | Alarmă la lipsa secretului de webhook | Fără `STRIPE_WEBHOOK_SECRET`, sistemul alertează, nu doar eșuează tăcut | ☐ |
| C6 | **Reducerea ajunge la Stripe** | Un checkout cu cod de promoție: `amount_total` = suma discountuită = `order.total` | ☐ |
| C7 | `renew()` nu fabrică facturi `PAID` | Sweep-ul cu Stripe neconfigurat nu creează nicio factură | ☐ |
| C8 | `invoice.paid` prematur e reluat | Un `invoice.paid` înainte de `checkout.session.completed` produce o factură | ☐ |
| C9 | Job de reconciliere cu Stripe | Un job de reconciliere există și rulează | ☐ |
| C10 | Prețul stocat = prețul configurației | Estimarea lunară din panoul client = prețul de configurare | ☐ |
| C11 | Unitatea e spusă în contract | `docs/API_CONTRACT.md` și payloadul API spun explicit „minor units" | ☐ |
| C12 | Produs nou ≠ gratuit | Un produs creat prin admin fără preț nu apare public | ☐ |
| C13 | Comandă anulată nu poate fi onorată | Un `checkout.session.completed` pe o comandă anulată e refuzat | ☐ |
| C14 | Plan anual real, dacă se vinde | Un plan `YEARLY` se cotează, se plătește și generează 12 luni | ☐ |
| C15 | Promoțiile pot fi oprite | `PATCH`/`DELETE` pe `/admin/promotions` funcționează | ☐ |
| C16 | `maxPerUser` setabil, plafon atomic | O campanie „primii 50 eligibili" se oprește la 50, per cont | ☐ |
| C17 | Contorul afișat = plafonul aplicat | Ce arată operatorul e chiar numărul de rezervări + plăți | ☐ |

---

## D. Date, backup și recuperare

| # | Rând | Dovada cerută | ☐ |
|---|---|---|---|
| D1 | Țintă off-host configurată | `OFFSITE_TARGET` și `OFFSITE_ENCRYPTION_KEY` setate **și** prezente în backup | ☐ |
| D2 | Backup programat | Cron/jobs active; rulări recente dovedite în log | ☐ |
| D3 | **Backup-ul Pterodactyl activat per server** | Setarea e activă și o copie există | ☐ |
| D4 | Secretele au copie | `.env` e în backup | ☐ |
| D5 | **Drill de restaurare reușit, pe o copie off-host** | Restaurare completă pe o mașină goală, cu data și rezultatul scrise | ☐ |
| D6 | Al doilea drill, scenariu diferit | Pierderea unui singur server de joc, nu a hostului | ☐ |
| D7 | RAID 1 pe `/` în loc de RAID 0 | `/proc/mdstat` → `md1 : active raid1` | ☐ |
| D8 | Retenție la anulare cu termen explicit | `auto_delete_cancelled_instances` setat; export înainte de ștergere | ☐ |
| D9 | Rotația secretelor are o cale de resetare | Procedura e scrisă și testată | ☐ |
| D10 | Documentul de recuperare are copilot și ordine | `03-disaster-recovery.md` §7 | ☐ |

---

## E. Suport și operațiuni

| # | Rând | Dovada cerută | ☐ |
|---|---|---|---|
| E1 | Cheia `SMTP_URL` reală | `/api/health` → `"mail": "smtp"` | ☐ |
| E2 | E-mail de verificare **livrat** | În inbox real, nu în fișier | ☐ |
| E3 | E-mail de resetare **livrat** | În inbox real | ☐ |
| E4 | **Notificarea de bilet ajunge la staff** | Un bilet nou ⇒ notificare livrată, nu o linie `[mail:file]` | ☐ |
| E5 | `/status` nu mai raportează „Support — Degraded" din cauza e-mailului | Verificat | ☐ |
| E6 | Runbook de incident scris | `docs/RUNBOOK.md` reflectă starea reală | ☐ |
| E7 | Instrumentul de browser reparat | `scripts/ops/browser-customer-panel.mjs` face 1 autentificare, nu 12 | ☐ |
| E8 | Politica de retenție a datelor, publicată | Termenul apare în interfață și în documentație | ☐ |
| E9 | Procedura de ștergere a contului, cu export | Funcționează end-to-end | ☐ |
| E10 | Lista de contact și timp de răspuns, publicate | Afișate pe site, realiste | ☐ |

---

## F. Comercial, legal și conformitate

| # | Rând | Dovada cerută | ☐ |
|---|---|---|---|
| F1 | Identitatea operatorului și datele de contact, publicate | Pe site, complete | ☐ |
| F2 | Termeni și condiții, AUP, drept de retragere | Publicate, acceptate explicit la comandă | ☐ |
| F3 | Cele 29 de elemente de conformitate verificate cu un profesionist | `11-compliance-checklist.md` — fiecare `NEEDS-PROFESSIONAL-CONFIRMATION` are un răspuns scris | ☐ |
| F4 | TVA și facturare: regimul confirmat | Răspuns scris al profesionistului | ☐ |
| F5 | Registrul e-mail și consimțământul | Baza legală și textul, verificate | ☐ |
| F6 | Politica de abuz și contactul pentru takedown | Publicate | ☐ |
| F7 | Drepturile IP asupra domeniului și resurselor | Confirmate | ☐ |
| F8 | **Prețul e peste floor-ul nodului** | `P_floor = C_node / N_safe(config)`; `C_node` e valoarea reală a operatorului, nu ancora de piață | ☐ |
| F9 | Cardul de preț al produsului vândut, în cod | `baseAmount` setat explicit, cu rata pe vCPU aleasă conștient | ☐ |
| F10 | Copy-ul public nu promite reduceri neimplementate | „50% off" apare **numai** după ce C6 e produs | ☐ |
| F11 | Simulatorul de preț arată prețul real | €1.49, nu €0.74 | ☐ |

---

## G. Marketing și comunicare

| # | Rând | Dovada cerută | ☐ |
|---|---|---|---|
| G1 | Afirmațiile permise azi vs. cele interzise, respectate | `10-positioning.md` §7.2 — fiecare afirmație din copy e pe lista permisă sau e marcată „după poartă" | ☐ |
| G2 | Nicio afirmație de uptime, de număr de utilizatori sau de recenzii | Verificat pe tot publicul | ☐ |
| G3 | Nicio promisiune de suport 24/7 dacă suportul nu e programat | Verificat | ☐ |
| G4 | Nicio promisiune de backup | „Backup" apare doar după D3 + D5 | ☐ |
| G5 | Nicio promisiune de DDoS | Doar după ce protecția e reală | ☐ |
| G6 | Nicio promisiune de plan anual | Doar după C14 | ☐ |
| G7 | Campania cu reducere nu e programată înainte de C6 | Verificat în planul de campanii | ☐ |
| G8 | Link-urile din copy trimit unde trebuie | Verificat pe fiecare | ☐ |

---

## H. Verificări finale, pe sistemul viu

| # | Verificare | Rezultat așteptat | ☐ |
|---|---|---|---|
| H1 | **20 de rulări consecutive** comandă → plată → provisionare → activare | 20/20 reușite, **0** servere orfane, **0** joburi eșuate | ☐ |
| H2 | Toate containerele healthy | `docker ps` — toate `healthy` | ☐ |
| H3 | Rutele publice răspund | `/`, `/app/instances`, `/api/health`, `/api/catalog/products` → 200 | ☐ |
| H4 | Testele automate trec | `bash scripts/run-tests.sh` → 240/240 | ☐ |
| H5 | Verificările de browser trec | Toate rutele × lățimile, 0 probleme | ☐ |
| H6 | Verificările noii porți de release | Toate cele 13 porți în verde | ☐ |
| H7 | Inventarul de produse și prețuri e cel așteptat | `GET /api/catalog/products` | ☐ |
| H8 | Documentația e corectă | Tabelul de verificare al documentației: **0** `wrong` | ☐ |
| H9 | Scanare de secrete în tot ce se publică | Nicio cheie în cod, în config, în copy | ☐ |
| H10 | Lista de secrete rotite, cu cea veche invalidată | Verificat | ☐ |

---

## I. Semnătură

| Rol | Nume | Data | Semnătură |
|---|---|---|---|
| Operator | | | |
| Responsabil tehnic | | | |
| Confirmare a celor 19 condiții de la `16-GO-NO-GO-DECISION.md` §4 | | | |

**Regula finală:** dacă un singur rând din H e necompletat, lansarea nu se face. Dacă un singur rând din A–G e necompletat, **se poate lansa doar în scenariul C** (waitlist, fără încasare, fără clienți plătitori).
