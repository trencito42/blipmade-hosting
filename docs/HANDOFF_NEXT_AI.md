# Handoff for the next AI (Blipmade) — 2026-11-05

Repo `trencito42/blipmade-hosting`, working copy `/root/work`. Stefan writes Romanian, informal. Keep reports short.

## Standing rules (from Stefan, do not break)
- GitHub `main` = production. Publish: `bash scripts/publish.sh` (VM103 relay). Deploy is a SEPARATE command (`/opt/blipmade/scripts/deploy.sh`), only after Stefan says so in chat. Never chain publish + deploy.
- Production is still on `5001bc28`. `c9edb1a6` (#23 fix) is NOT live. Do not claim otherwise.
- Stripe: TEST mode only, isolated env. Never touch production `.env`/Stripe keys, never restart the live API, no real payments/refunds.
- Never print or commit credentials. Disclosed Stripe test keys + the broad GitHub classic token must be rotated/revoked by Stefan (remind him).
- #21 stays open until Stefan signs off financially/legally; do not activate in production.
- Do not close issues unless Stefan says (only when acceptance criteria are met). #23 is closed.
- Work autonomously, no repeated questions. Final report: done / tests passed+failed / commits / real blockers / next step.
- Env: Node 22 at `/opt/node22/bin`. API tests need the DB on the bench VM103 (`ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13`). Two vitest runs share one DB: never run them at the same time. Never `pkill -f <pattern>` with the pattern in your own command line.

## State
1. **#24 Smart Connect**: committed locally as `33200f3d`, NOT yet published. Flag `GAME_CONNECT_ENABLED` default off; FiveM profile OFF; Minecraft Java + Factorio (experimental) on. 14 API + 3 e2e tests green, 29 web e2e regression green. Docs: `docs/SMART_CONNECT.md`.
   - Full API suite was running on the bench: log `~/api-full-24.log` on VM103. Known pre-existing failing files: `egg-environment-template`, `backup-offsite-drill`, `support-email`. Check there are no others.
2. **#20** started: `api/src/services/catalog-install-apply.ts` now skips a plugin with no build for the game version (recorded as `orderInstall.skipped` + instance event) instead of failing the whole install. UNCOMMITTED. New test `api/tests/catalog-order-install.test.ts` written but NOT yet run.

## To do, in order
1. Read `~/api-full-24.log` summary (`grep -E "Test Files|Tests " ; grep "FAIL "`). Only the 3 known files may fail.
2. Run `tests/catalog-order-install.test.ts` on the bench (after the full run ends). Fix if needed. Commit.
3. Publish: rebase on `refs/remotes/github/main`, `bash scripts/publish.sh`. DO NOT deploy.
4. Comment on #24 with exact results: tests, flag off by default, FiveM off, nothing verified with real game clients, two-servers-on-one-IP end-to-end needs staging, no staff switch for CLIENT_VERIFIED, no AAAA records. Do not close #24.
5. #20 rest: idempotent, DRAFT-ONLY seed script for presets (Minecraft presets with Modrinth slugs verified: luckperms, worldedit, worldguard, bentobox; essentialsx only supports up to 26.1.2 -> note it; Discord bot family with Node.js/Python variants and Blank/Git/ZIP presets). Use the existing catalog architecture and the #22 contract. No destructive change to products/servers/pricing/deployability. Test on bench, never run in production. Comment on #20.
6. Tell Stefan: production deploy of `c9edb1a6` (and Smart Connect later) needs his explicit "deploy"; run the relevant API regression tests and verify the deploy procedure first.

## Open limits (be honest about them)
- VAT not verifiable (Stripe Tax not configured).
- Nothing tested with real Minecraft/Factorio/FiveM clients.
- Hostname routing on a shared IP:port is only possible for Minecraft Java; other games need SRV (where supported) or paid dedicated/packed public IPs.
