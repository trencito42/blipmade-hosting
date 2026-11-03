# Full product acceptance: issues #18–#23 (no scope reduction)

**Owner directive 2026-11-03:** Implement the actual customer-facing capabilities specified in [#18](https://github.com/trencito42/blipmade-hosting/issues/18), [#19](https://github.com/trencito42/blipmade-hosting/issues/19), [#20](https://github.com/trencito42/blipmade-hosting/issues/20), [#21](https://github.com/trencito42/blipmade-hosting/issues/21), [#22](https://github.com/trencito42/blipmade-hosting/issues/22), [#23](https://github.com/trencito42/blipmade-hosting/issues/23), preserving the capabilities, safety constraints and acceptance tests in EACH original issue body. **A scope cut to the currently supported subset is NOT an implementation of the issue.** Do not close any issue before its accepted scope, tests and production readiness are demonstrated.

This file is an execution/verification contract. It does **not** declare completion. It does not authorize destructive production operations, credential collection, production DNS migrations, billing changes or deploys without explicit approval.

## Reality check: current main source findings

- **#18:** `ImportProject` and `/catalog/import/inspect` already expose metadata inspection for Git/ZIP. This does NOT prove uploaded ZIP end-to-end deploy, safe builds, managed SQL/Redis dependency wiring, lifecycle monitoring, redeploy or rollback.
- **#19:** Java Minecraft status, Paper plugin search/install, Forge modpack support and some player commands exist. They do NOT complete every Minecraft Worlds/Players/Addons workflow or individual Rust, FiveM, CS1.6, CS2, Valheim and other capability adapters. Never show fake controls for eggs that cannot support an operation.
- **#20:** Prepared families/presets exist, but the deployed storefront originally surfaced groups only with more than one orderable variant. The initial PR in this branch also exposes prepared singleton families correctly. This does NOT ensure every one of the 68 manifest eggs is mapped to a meaningful family, nor that Discord Bot templates install real code.
- **#21:** Some resource limits, proration and credit logic exist. This does NOT replace tests for Stripe correctness, monthly/annual boundaries, credit concurrency, 2/rolling-30-days enforcement and approved terms/customer disclosure.
- **#22:** A repurpose API and a within-family selection UI exist. They do NOT prove safe cross-family repurpose, saved configuration profiles, approved addon installers for applicable families, backup/rollback, license/port compatibility, billing continuity or validated sandbox outcomes.
- **#23:** Exact custom hostname claiming/TXT/A/Caddy and public HTTPS checks exist in request-time Verify. Customer Cloudflare-zone connection with least-privilege token, game DNS A/SRV, true automatically refreshed DNS/TLS/HTTP state, safe record lifecycle and customer manual DNS options are not all complete. Current Cloudflare module is for **Blipmade's own Cloudflare zone**, not a customer's connected Cloudflare zone. There is no need to move `blipmade.com` nameservers or any customer's nameservers as a default.

## Functional acceptance gates (each issue remains OPEN until complete)

| Issue | Product deliverable | Release evidence needed |
|---|---|---|
| #18 Smart Import | Full-page Import ZIP/public Git wizard, static runtime/port/dependency detection, adjustable quote and consent, secure staging/upload storage, untrusted code install/build only in isolated customer/build worker, deploy and health, SQLite persistence warning and optional validated SQL/Redis provisioning, linked Project resources, safe retries, cleanup and redeploy/rollback | ZIP+Git deploy tests for every supported runtime, malicious/archive traversal/decompression tests, provider staging deploy, database/Redis isolation, billing and restore |
| #19 Game-aware control | Capability-derived workspace, Minecraft Players/Plugins/Modpacks/Worlds/Settings, world safety and reliable metrics; real game-specific plugin/mod adapters per supported egg family, Advanced exposes all legacy technical functions, safe version compatibility | Per-family capability matrix with actual server software/loader and provider, install/remove/update+rollback on disposable sandbox servers; validate old console/files/backup routes and disabled unsupported controls |
| #20 Deploy 68 eggs | Explicit audited coverage of every manifest entry in a browsable product family/category/variant; prepared presets and actually provisioned Discord Bot templates, transparent Ready/Unavailable; exact product variant saved from checkout | 68-row manifest mapping and family/preset test, screenshots of catalog and family detail, confirmed template artifact deployed to disposable bot server; no duplicates/missing products or fake orderable statuses |
| #21 Resource change | Monthly+annual resource resize with min/max/capacity, 2 changes per rolling 30 days, exact upgrade proration and fair downgrade credit, persisted account ledger and billing reconciliation, rollback/retry, customer-facing terms editable/approved | Concurrency and 30-day boundary tests, cents/VAT/currency, annual edge cases, provider failure rollback, Stripe sandbox and user credit ledger totals |
| #22 Add-ons & Repurpose | Discover/install/manage compatible add-ons after purchase, safe tested within-family runtime switches and cross-family repurpose when supported, explicit backups and compatibility preflight, saved profiles and resumption, correct plan/subscription/payment preservation | One end-to-end sandbox per supported family/operation, bad version/license/port cases, compare pre/post profile, rollback/restore and billing continuity; capability fallback never claims impossible support |
| #23 Domains 2.0 | Optional **customer** Cloudflare scoped-zone token connection with encrypted storage and dry-run/approve, non-overwriting DNS upsert with record ownership, manual flow, web TXT/A/HTTPS verification, protocol-aware game DNS-only A/CNAME/SRV, explicit email domain routing and reliable status polling | CF scoped token/zone tests, foreign-record conflict and disconnect, authoritative NS and mail retention, real staging TLS host with refresh/retry, Minecraft SRV and UDP/TCP game DNS, no Caddy for game host, no false Active |

### Important: unsupported *current egg* ≠ impossible product feature

If an egg lacks a plugin installer, the implementation may add a provider-specific, sandboxed install service/job using a vetted installer and compatibility metadata, or expose a truthful disabled state while implementing that adapter. It must **not** silently close the issue by removing that game from scope. When a runtime genuinely does not support plugins, identify the actual ecosystem, provide the applicable alternative (maps/configuration/workshop/mod loader) and test that workflow; never imply there is one universal installer or promise arbitrary plugin support.

### Implementation order and dependencies

1. **P0 correctness/safety**: provider readiness, domain status and DNS correctness, catalog availability, exact money, security checks, idempotency and job retries.
2. **#20 family/source-of-truth** before #22 addon compatibility and #19 product-aware workspace. Map every manifest egg and runtime, including unavailable capabilities, without forcing singleton products to be blank.
3. **#18 import stack MVP** ZIP/Public Git in isolated execution with staged environment, then SQL/Redis and project lifecycle. Each new runtime needs evidence and an honest support matrix.
4. **#19 + #22 capability adapters and addon/repurpose job pipeline**, with versioned profiles, backup and safe rollback; don't conflate games with identical Pterodactyl egg semantics.
5. **#23 customer DNS integration** Cloudflare manual/connected, game protocol routing and verified HTTPS, without touching existing mail records.
6. **#21 full financial reconciliation/terms** before selling changed resource configurations or claiming customer credit as settled; accounting tests are blocking.
7. Security, operations and owner sign-off for each module; don't make a full production rollout before isolated tests pass.

## Closure protocol

For each #18–#23, write an evidence comment with:
- implemented API/UI code and commit(s);
- a checklist mapping **every** issue-level requirement to a working feature or explicitly owner-approved scope change;
- actual test command + pass/fail output (not merely claiming tests), staging provider demo and screenshot as appropriate;
- security, compatibility, cost and rollback analysis, deployment version and known limitations;
- verification that old products, routes, billing and customer data are not lost.

Only then close with `state_reason=completed`. **Never** close as `not_planned` or treat a partial plugin ecosystem/ZIP inspector/Cloudflare nameserver observation as completion. Keep open if acceptance is incomplete; safe progress commits and a draft PR are better than false closure.

## Current work branch

`feat/fulfill-issues-18-23` is one combined workstream for these six issues, to avoid fragmenting work across per-issue branches. Any substantive changes, tests and evidence should be committed here and reviewed. It is independent of production and the previous /app/admin redesign branch. Do not overwrite concurrently running agent changes or merge without checking latest main.

**Current partial code changes in the branch:** protect domain reconciliation from marking a merely routed hostname `ACTIVE` (#23), and expose prepared one-variant catalog families (#20), with focused tests. **These are partial changes only, not a claim of either issue complete.**
