# 06 — Deploy and catalog

Production SHA `8b07cd2d`. Dirty Deploy Studio in `/root/work` is **not** production.

## Customer buy paths (code)

| Path | Component | Role |
|---|---|---|
| `/app/deploy` | DeployStudio | Primary picker |
| `/app/deploy/families/:slug` | FamilyDeploy | CatalogFamily overlay |
| `/app/deploy/:slug` | product wizard | Legacy Product |
| `/app/vps/new` | Vps | VPS checkout |
| `/app/email/checkout` | EmailHosting | Mail checkout |
| `/apps` | Apps.tsx public | Marketing list |

Five paths, two data models (`Product*` vs `CatalogFamily/Variant/Preset*`). BM-020.

Public `/app/deploy` redirects to login (browser). Authenticated wizard BLOCKED.

## Public catalogue (VERIFIED 2026-11-06)

`GET https://blipmade.com/api/catalog/products`: **75** products, **59** `orderable`/`DEPLOYABLE`, **16** `COMING_SOON`.

Groups: GAMES 33, DEVELOPER_TOOLS 17, AUTOMATION 7, DATABASES 4, MONITORING 4, VPS 4, EMAIL_HOSTING 3, BOTS 2, WEB_CMS 1.

Orderable includes `folding-at-home`, `dart`, `lua`, `golang`, `rust-runtime`, `wordpress`, `discord-bot`, four VPS, three email (€2.99–€11.99). CS2/FiveM/Hytale COMING_SOON with reasons — honest.

`/apps` copy: “49 things you can deploy right now” vs API 59 (BM-019). Likely prerender vs live, or VPS/mail filtered.

## Readiness gate

`readiness-gate.ts`:

- Server SKUs: egg named + panel reachable + **node free RAM/disk vs default plan**.
- VPS: **only** `proxmoxConfigured`. No RAM/disk/slots (BM-016). `VPS_MAX_SLOTS` default 150.
- Mail: `MAIL_SALES_ENABLED` only. Production true (BM-018).

`deployable` is a config+capacity check, **not** a watched install of that slug.

## Import / ZIP

Inspect: `zipLayoutProblem` refuses `..`. Apply: `installArchive` → Wings decompress (BM-013). Git deploy uses same Wings path.

## Product opinion

Catalogue is a museum of eggs, not a proven store. Competitors sell 3–8 SKUs they can restore. Dual admin Catalog vs Catalogue families trains operators to edit the wrong table. Freeze `Product` as checkout source or freeze families — not both. Hide COMING_SOON from the “deploy now” count.
