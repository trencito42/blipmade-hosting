# Known issues, failed tests, blockers and unverified assumptions

Date 2026-11-05. Severity: **S1** security/money/data, **S2** wrong behaviour or blocks a release, **S3** debt or noise. "Evidence" says what I actually saw.

## Security and operations

| ID | Sev | Problem | Evidence / location | Fix |
|---|---|---|---|---|
| K-01 | S1 | Credentials were pasted in chat: Stripe TEST keys (secret, publishable, webhook secret) and a broad GitHub classic token. The token was later used from the VM103 relay to post issue comments. | Chat transcript of this session; no file in the repo contains them (not scanned beyond gitleaks CI). | The owner must rotate the Stripe test keys and revoke the token, then create a fine-grained token limited to this repository (issues:write, contents:write). Never print, copy or commit them. |
| K-02 | S1 | Whether production Stripe is live and payments enabled is unknown to me. Anything touching money must be treated as live. | Owner remark "even if Stripe is live"; not read from `.env`. | Ask the owner; never read or edit production `.env` without being told to. |
| K-03 | S2 | Smart Connect writes Cloudflare records in the platform zone when the flag is turned on. First real write is untested. | `api/src/services/game-connect.ts`, `cloudflare-dns.ts`. Only a fake Cloudflare was used. | Enable only on staging with a disposable zone first (roadmap P2). |
| K-04 | S2 | Authorization: `/instances/:id/connect/sync` is limited to manager/owner and viewers get read only; verified by test, but the path whitelist for viewers lives in `api/src/services/panel/operations.ts` and must be kept in sync when routes are added. | `game-connect.test.ts`, `instance-access-role.test.ts` passed. | Keep a test per new instance route. |
| K-05 | S3 | `docs/LAUNCH-BLOCKERS.md`: 27 facts only the operator can write in the legal documents (VAT id, retention, liability cap, refund exclusions, SLA figure...). The launch is not approved while any is open. | `scripts/launch-blockers.mjs` output. | Owner supplies text; do not invent legal facts. |

## Tests

Full API suite on the bench (213 test files) did **not** finish inside its 1500 s timeout on 2026-11-05, so there is no total. These failures appeared (names from the log `~/api-full-24.log` on VM103):

| File | Failing | Verdict |
|---|---|---|
| `egg-environment-template` | 4 tests (+2 seen on the later rerun) | Failed identically without my Smart Connect change. Pre-existing. Look at egg lookup by name/env template. |
| `backup-offsite-drill` | 2 ("names the recovery of the encryption identity", "names the drill that proves the off-site copy") | Pre-existing; documentation assertions. |
| `support-email` | 2 (file stored on message, file of a reply) | Pre-existing (attachment storage). |
| `support-p0` | 1 ("stores a real png and lets the owner download it") | Pre-existing: also failed in `api-full-rest.log` earlier. |
| `panel-pagination` | 6 | The bench cannot reach a Pterodactyl panel ("could not be reached"). Environment, not a code regression; I did not confirm it against an older tree. |
| `yearly-term` | 1 ("refuses a monthly quote of a product that has no price") | **Not compared to a baseline.** My diff does not touch pricing, so probably pre-existing or order dependent. Check first. |

- `npx tsc -p tsconfig.test.json --noEmit` on the bench reports errors in `api/src/lib/validation-messages.ts` (zod issue types such as `origin`, `invalid_format`). The bench's installed zod differs from the repo lockfile. Run `npm ci` on the bench and re-run; CI result unread. UNVERIFIED whether CI is green.
- Web: 29 related Playwright specs passed this session; the whole web e2e suite was not re-run (it takes more than 10 minutes with 1 worker; use `--workers=4` per `docs/ai/TEST-STATUS.md`).
- Passing and relevant: `game-connect` (14), `catalog-order-install` (2), `catalog-draft-presets` (3), `domains`, `domains-cloudflare-routes`, `instance-access-role`, `customer-cloudflare` (44 related in total).

## Product defects and unverified behaviour

| ID | Sev | Problem | Location | Fix |
|---|---|---|---|---|
| K-10 | S2 | Smart Connect never tested with a real Minecraft, Factorio or FiveM client. FiveM is OFF because `_cfx._udp` is not confirmed. | `GAME_PROFILES` in `game-connect.ts` | Staging test per client; only then set `CLIENT_VERIFIED` (there is no staff switch for it yet). |
| K-11 | S2 | No end-to-end proof that two servers on one IP resolve to two ports. | n/a | Staging with real Cloudflare and two Wings servers. |
| K-12 | S3 | No AAAA record support in Smart Connect; the public address must be IPv4. | `isPublicIpv4` | Add only when the node has IPv6. |
| K-13 | S2 | Preset install is not proven on a live Pterodactyl server (plugin download, file write, manifest `verifying` then `installed`). | `catalog-install.ts`, `catalog-install-apply.ts` | Disposable node run (roadmap P1). |
| K-14 | S2 | Order-time install covers only `minecraft-paper` plugins and `minecraft-forge` modpacks; other families ignore `install.plugins`. | `catalog-install-apply.ts` lines about `instance.product.slug` | Generalise through the family/variant capability, not slugs, when more families get plugins. |
| K-15 | S3 | `publishReadyFamilies` is not run by deploy; new families stay hidden until it runs. | `catalog-drafts.ts` | Decide with the owner (it flips visibility). |
| K-16 | S2 | Daily81 import never built on a disposable node; MariaDB egg has no password variable (platform stores one password per database); Go/Rust imports have no start command. | `docs/IMPLEMENTATION-18-23-STATUS.md`, `import-*.ts` | Disposable node run. |
| K-17 | S2 | #21: VAT unverified (Stripe Tax not configured), wording is a draft, no finance/legal sign-off, no live-mode test. | `EditResources.tsx` line with "draft" wording | Owner decision; do not activate. |
| K-18 | S3 | Instance cancel endpoint exists but is not exposed in the UI because it cancels immediately (conflicts with "runs until period end"). Access share role edit has no endpoint. | `docs/ai/DECISIONS.md` | Product decision. |
| K-19 | S3 | Hosted mail plans have no price by design; products stay "coming soon" until `probe-eggs.mjs` proves them on the node (51 probes failed on 2026-10-29). | `docs/ai/OPERATOR-ACTIONS.md` | Operator actions. |
| K-20 | S3 | Early notes in `docs/ai/*` and `docs/IMPLEMENTATION-18-23-STATUS.md` are stale (old production commits). | those files | Refresh or delete after reading, do not trust their "production is" lines. |
| K-21 | S3 | EssentialsX is not in any preset: latest Modrinth build supports only up to 26.1.2. | `DRAFT_PLUGIN_PRESETS` | Re-check Modrinth before adding. |
| K-22 | S3 | `/opt/blipmade` is shared with other automation that may deploy from it. Check it is clean and no build is running before a deploy. | `scripts/deploy.sh` refuses a dirty tree | Follow the script. |

## Backups and recovery limits
- Off-site copies are encrypted; the age private key is not on the host, so an AI cannot drill a restore of them. A restore drill of the database dump exists (`scripts/restore-offsite-drill.sh`, passed 2026-11-01).
- Customer game backups are opt-in per customer through panel schedules.
