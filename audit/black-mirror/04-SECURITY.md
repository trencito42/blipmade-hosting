# 04 — Security

**Pass:** 2026-11-06. Production SHA `8b07cd2d`. No live two-account IDOR. No secret values printed.

## Authentication (code)

- Cookie `bm_session`: HttpOnly, SameSite=Lax, Secure in production (`resolveCookieSecure`). VERIFIED.
- CSRF double-submit `bm_csrf` (not HttpOnly). Exempt: login/register/forgot/reset/verify, `/api/webhooks/`, `/api/oauth/`, Discord interactions, inbound without session, Bearer `bmk_` without session.
- Login rate limit `LOGIN_RATE_LIMIT_MAX` default 10. Not load-tested.
- `PTERODACTYL_CLIENT_KEY` empty; keymint configured. Customer panel actions mint per-customer keys (`panel/operations.ts`). Live mint UNVERIFIED.
- OAuth: `state` consumed on callback. Google/Discord/Apple use S256 PKCE. GitHub does not (BM-017, P3). Confidential-server app; not CSRF by itself.

## Authorization

- `loadOwnedInstance` 404s foreign IDs. VERIFIED code. Live IDOR with two accounts BLOCKED (no test pair).
- Viewer share: GET-only whitelist on activity/resources/server/connect. Regex risk remains if a new secret route matches `/server`.
- Staff: `requireStaff` / `requirePermission` on admin routes. Invite/grant/remove exist (`/admin/staff/*`). Every handler not line-audited.
- Guest claim `POST /support/guest/claim` requires auth; anonymous → 401. Tests expect this. **Not a defect (BM-022).** `ChatWidget` only in authenticated shell.

## Encryption (BM-003)

`api/src/lib/secrets.ts`:

- v1: `scrypt(SESSION_SECRET, 'blipmade:secret-box', 32)` AES-256-GCM.
- v2: `scrypt(DATA_ENCRYPTION_SECRET, 'blipmade:data-encryption:v2', 32)` when set.
- Production: `DATA_ENCRYPTION_SECRET` UNSET → new boxes are v1.
- `decryptSecret` reads both; v2 fails closed if data key missing.
- `upgradeSecretEncryption` exists; not run in production.
- **Session-secret rotation bricks or requires dual-read of all v1 rows** (2FA, OAuth refresh, panel tokens, CF tokens, instance vars).
- Leak of `SESSION_SECRET` decrypts all v1 stored secrets **and** forges sessions. No key versioning on v1.

## Application

- Prisma parameterized. Raw SQL not exhaustively grepped.
- ZIP inspect refuses `..` / absolute / NUL / 80 MB. Apply uses Wings `decompressArchive` (BM-013).
- Public `/api/health` leaks `stripe:live` and panel wiring (BM-007).
- Helmet on; Fastify `contentSecurityPolicy: false`. Browser CSP UNVERIFIED (Caddy).
- Compose: no privileged, no docker.sock, memory limits. VERIFIED earlier inspect.

## Network

- SSH keys only, `PermitRootLogin without-password`.
- PVE `:8006` all interfaces; eth0 DROP via `BLIPMADE-HOST-INPUT`. **TCP open from VM103 to 10.77.0.1:8006 (H4 confirmed).** Auth still required. Internet 8006 UNVERIFIED.
- Wings `:8080` and SFTP `:2022` DNATed on game IP. External reachability UNVERIFIED.
- MariaDB `10.77.0.11:3306` open from VM103 (BM-010). No login attempted.
- VPS L2 on vmbr2, no port isolation (BM-011, PARTIAL).
- GlitchTip `:8000` on vmbr1 only.

## Supply chain

CI: gitleaks, `npm audit --audit-level=high`, actionlint, schema drift. Current GitHub run UNVERIFIED (`gh` missing).

## Top risks

1. Live payments on unproven SKUs (BM-002/015).  
2. Session secret = data-at-rest key (BM-003).  
3. RAID 0 host (BM-001).  
4. MariaDB on Wings LAN (BM-010).  
5. VPS L2 (BM-011).  
6. Public Wings 8080 UNVERIFIED.
