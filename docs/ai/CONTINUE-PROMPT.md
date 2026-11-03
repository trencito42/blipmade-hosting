# Prompt to continue the work (ChatGPT, Codex, MiniMax or any agent)

Copy everything below the line into the new agent. It is written so the agent needs nothing else from the previous conversation.

---

You continue the Blipmade platform (repository `trencito42/blipmade-hosting`, branch `main`, which is production truth). Work in small commits and never merge or deploy without the owner's explicit "yes". Never print or store secrets.

## Read first (in this order)
1. `docs/ai/AGENT-HANDOFF.md`, `docs/ai/IMPLEMENTATION-STATUS.md`, `docs/ai/MASTER-ROADMAP.md`, `docs/ai/DECISIONS.md`, `docs/ai/TEST-STATUS.md`, `docs/ai/OPERATOR-ACTIONS.md`.
2. The specs: `audit/app-master-2026-11-03/*` and `audit/admin-master-2026-11-03/*` (especially `EDITOR-ROUTE-BLUEPRINT.md` and `PREMIUM-COMPONENTS.md`).

## State
- Customer App 3.0 (`/app`) and Admin 3.0 (`/admin`) have dedicated editor pages for every create/edit/destructive flow. Production runs the latest `main`.
- Conventions you must keep: editor routes use `layout: 'editor'` in `web/src/routes.tsx` (specific routes before `:id` routes), pages use `PageEditorShell` (one `h1`, Back in the top bar, unsaved-changes guard), lists use `DataTable`/`usePaged`/`Pager`, hints are tooltips (`web/src/tooltip.tsx`) not paragraphs, no placeholder pages.
- Tests: unit `cd web && PATH=/opt/node22/bin:$PATH npm test` (needs Node 22; 497 pass). E2E are stub-based Playwright specs (`web/e2e/admin-stub.ts` for Admin); run in bounded batches with `--workers=4`; `admin-audit.spec.ts` needs a seed and is not part of the batch. API tests need a disposable database (`TEST_DATABASE_URL`, `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`).
- Known and not mine: 13 public/auth/mobile e2e failures that already failed before this work.

## Task A: four Admin functions (decisions already taken by the owner's assistant, confirm with the owner if you disagree)
1. **Saved views** on the Admin lists (customers, orders, services, tickets): per operator, not shared. New table `AdminSavedView(id, userId, scope, name, query json, createdAt)`, migration, `GET/POST/DELETE /admin/saved-views?scope=`, a small "Views" control on each list that stores and reapplies the filters and sort, API tests, e2e.
2. **Column picker** on the big tables: kept in the browser (`localStorage`, wrapped in try/catch, the page must work without it). No database change.
3. **Step-up for staff roles**: before changing a role or the permissions of a staff member (`PUT /admin/staff/:userId`) require a fresh confirmation (password or 2FA code) valid for 10 minutes. New endpoint to confirm, a `stepUpUntil` stored on the session, the API refuses the write with a clear error when it is missing, the page `web/src/admin/StaffEdit.tsx` asks first. Audit log entries for both. Do not extend it to refunds or suspension unless the owner asks. This one touches security: write API tests first, no bypass, no secrets in logs.
4. **Rich-text editor for email templates**: do not build it now. The structure of the messages stays in code; only subject, heading, preheader and note are editable.

## Task B: the issues #18 to #23 (proposals; implement only after the owner says go, one at a time, in this order)
- #20 catalogue families/variants/presets/add-ons (no live catalogue change without approval) -> #22 post-purchase Add-ons/Repurpose/profiles (uses #20) -> #19 game-aware instance workspace and Minecraft manager (additive) -> #18 Smart Deploy ZIP/Git import (research first).
- #21 resource resize billing needs finance/legal sign-off and a Stripe reconciliation test before it is enabled.
- #23 Domains 2.0 with Cloudflare DNS needs Cloudflare credentials and zone decisions from the owner; no nameserver migration without approval. It also unlocks the domain availability check and TLS state in `/app/domains`.
- For each issue: write a short plan in `docs/ai/IMPLEMENTATION-STATUS.md`, build it as dedicated pages with API + tests, update the docs, commit often.

## Task C (do this first): old branch `audit/launch-hardening-2026-10-30`
It holds 56 commits (about 13 security, 9 billing, 24 test) from 30 Oct 2026 that are not in `main` by patch id. Some are already in `main` in another form (for example the atomic invoice sequence in `api/src/services/order-numbers.ts`). Others do not appear to be: the independent encryption key for customer credentials (and the re-encryption migration), the exact allowlist for signed Pterodactyl downloads with streaming of large files and backups, validation of the console WebSocket origin, single-use password-reset and email-verification tokens under concurrency, the trusted-proxy rate-limit fix, and the Stripe refund/payment-state guards. For each commit decide: already in `main`, to port, or obsolete. Port by hand onto current `main` (the branch differs from `main` by 757 files, so do not merge it), with its tests, and run the API suite on a disposable database. Billing and security changes need the owner's approval before deploy; the encryption migration must stay dry-run-first.

## Rules
- Update `docs/ai/*` at every checkpoint; commit and push often.
- Report honestly: say what is tested, what is not, and what you could not run. Never mark anything VERIFIED without a passing run.
- Ask the owner before anything outward-facing (deploy, merge, emails, payments).
