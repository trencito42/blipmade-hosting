# Blipmade Hosting — Security & Release Review
**Date:** 2026-10-30
**Baseline:** `24ef2f412750c2204bfb44376f48f0d8b152564c`
**Work branch:** `audit/launch-hardening-2026-10-30`
**Decision:** **NO-GO for public commercial launch until operator gates are proven.**

## 1. Evidence and limitations

This is a source review and targeted remediation on the GitHub repository. The repository tree was enumerated (~1,015 tracked file entries), but that is NOT a claim that all files were manually reviewed. Targeted modules reviewed include API authentication, authorization, sessions, rate limits, CSRF, Stripe webhooks, provisioning, Pterodactyl identity and console, instance operations, domain routing, health and operational documentation. GitHub code search was used to locate unsafe randomness, raw SQL execution, TLS-verification bypasses and other sensitive patterns.

The reviewer did not log into the deployment VMs, inspect confidential environment values, perform external penetration testing, start customer containers, execute a Stripe live charge, migrate a live database or perform a real disaster-recovery drill. The production service was not redeployed as part of this work.

**Rules of evidence:** "patched in branch" is not "regression test passed"; "documented previously" is not "verified now"; a passing CI suite does not by itself verify the host or tenant isolation.

## 2. Reproduced from source and patched

| ID | Severity | Source evidence on baseline | Remediation | Verification |
| --- | --- | --- | --- | --- |
| SEC-01 | P1 | `api/src/routes/instances.ts`: cookie-authenticated console WebSocket upgrade did not check the request Origin | Add pre-validation with strict `APP_ORIGIN` allowlist and authenticated-session requirement | New `api/tests/websocket-origin.test.ts`; full CI and authenticated socket integration pending |
| SEC-02 | P1 | `api/src/plugins/auth.ts`: untrusted `X-Forwarded-For` changed limiter key to `IP:remotePort`; reconnects could bypass IP limits | Use Fastify-resolved IP exclusively, fail closed on untrusted proxy configuration | Replaced negative tests in `api/tests/phase14-address-key.test.ts`; CI pending |
| SEC-03 | P1 | `api/src/routes/instances.ts`: server command string persisted as customer-visible instance event | Store command occurrence only, not its text; authorization and command dispatch unchanged | Regression added to `api/tests/instance-operations.test.ts`; CI pending |
| SEC-04 | P1 | `api/src/routes/auth.ts`: reset/verification tokens checked then consumed with unconditional update, enabling concurrent reuse of a single token | Conditional update and account change in one PostgreSQL transaction | `api/tests/password-reset-race.test.ts` and `email-verification-race.test.ts`; CI pending |
| SEC-05 | P1 | `api/src/services/panel/identity.ts`: Pterodactyl account password generated with `Math.random()` and a timestamp | Generate 32 cryptographic random bytes through `randomToken(32)` | Regression in `api/tests/panel-identity.test.ts`; CI pending |

**Important correction:** The console intentionally uses HTTP POST `/instances/:id/command` to send commands and WebSocket streaming to receive output. The lack of browser-to-WebSocket forwarding is not by itself a functional defect.

### SEC-01 — Threat boundary

The application hosts customer-controlled software under subdomains associated with the primary site. SameSite cookies are not an adequate defense for WebSocket upgrades across same-site but distinct origins. A cookie-authenticated browser WebSocket needs its own explicit Origin check. The patch refuses missing or malformed Origin, unconfigured origins and customer-app subdomains while accepting exact configured dashboard origins. Because the check runs in preValidation, it rejects before relay setup.

**Residual:** Test the actual Cloudflare/Caddy websocket forwarding and `APP_ORIGIN` configuration in staging. Test negative origins with a real browser and real session cookie.

### SEC-02 — Trade-off and operator requirement

The patched limiter uses the IP Fastify resolves from explicitly trusted proxies. When a deployment proxy is not trusted, users behind it can temporarily share one IP-based quota. This must be corrected using `TRUSTED_PROXIES`, not by using an ephemeral TCP port as a rate-limit key. Check Cloudflare/client IP handling under realistic production proxy chains.

### SEC-03 — Residual log exposure

Only the Blipmade event history was changed. Raw commands can still be visible in server application output, the node's own audit trail or panel activity as designed by upstream software. Avoid sending secrets in commands wherever possible. Audit existing database rows and implement a governed retention/redaction plan before a public launch.

### SEC-04 — Transaction semantics

The password and email-verification tokens are now atomically claimed only when unused and not expired, within the same transaction as the corresponding account change. Tests exercise simultaneous submissions and replay. Validate tests against the actual PostgreSQL version and deployment topology.

### SEC-05 — Existing account remediation

The change applies to newly created Pterodactyl accounts. It does not rotate credentials of accounts previously created with a non-cryptographic generator. Inventory old managed panel accounts and perform controlled rotation using the panel's supported administrative APIs; no production account was touched here.

## 3. Operational and governance release blockers (not independently retested)

| ID | Priority | Evidence / state | Required before GO |
| --- | --- | --- | --- |
| GOV-01 | P1 | GitHub API reports `main.protected=false`. The CI workflow comment says jobs block merges, but repository protection is not enabled. | Enable branch protection/ruleset: required CI checks, PR review and no direct bypass for deployment branch. |
| DR-01 | P0 operational | Existing production-readiness docs state encrypted off-host backups were copied to another VM at the same provider. | Independent, encrypted copy with off-provider recovery test for both platform data and customer service volumes. |
| DR-02 | P1 | Existing audit reports describe host root on RAID 0. | Explicit acceptance of disk-failure risk, off-provider recoverability and RTO/RPO drill; redesign for redundancy where feasible. |
| TLS-01 | P1 | The 2026-10-29 operational checklist described a public TLS certificate gap for `*.apps.blipmade.com`. | Verify HTTPS from an external browser to an actually running customer application; no claim of resolution without current measurements. |
| TLS-02 | P1 | The launch checklist records earlier disclosure of Cloudflare origin certificate private-key material and further rotation requirements. | Generate and rotate keys strictly out of chat/logs, revoke old credentials, verify current certificate. |
| GOV-02 | P2 | Public operational documents contain administrator identifiers, internal network information and credential storage locations. | Move sensitive runbooks to a private destination; assess Git history and rotate secrets if any actual credentials were exposed. |
| OPS-01 | P1 | Previous launch checklist states many imported eggs were closed until proven working; one application egg had a runtime mismatch. | Enable only products passing real install/start/stop/restart, connectivity and management tests; verify current catalog again. |
| REL-01 | P0 operational | Baseline production has not been redeployed according to release input. | Deploy only after CI, staged migrations, backup, smoke tests and documented rollback. |
| FIN-01 | P1 verification | Code includes signed Stripe webhooks, event ledger, idempotency and payment gates; full recent live-state reconciliation has not been executed in this review. | Stripe test-mode concurrency suite, refund and renewal reconciliation and authorized production smoke test. |
| OPS-02 | P1 verification | Existing docs report mail and control-panel setup milestones, with prior transient outages. | Delivery to real external inbox, correct DNS records, panel permissions, incident alerts and backup monitor evidence. |
| LEGAL-01 | P1 verification | Commercial launch obligations are not established by source review. | Verify company disclosure, invoices/VAT, terms, privacy, DPA, abuse, refund and support policies with appropriate professionals. |

Do not publish credentials or private IP/service topology in the customer-facing status page, support responses or repository README. The private operator runbook may contain the necessary details with access controls.

## 4. Code controls observed, but not exhaustively penetrated

- Session-backed authentication, role/permission checks and customer-specific instance ownership queries.
- CSRF guard on state-changing HTTP requests, strict CORS origin configuration and secure cookie handling in production.
- Structured error responses, bounded upload/request sizes and explicit authorization on the inspected server routes.
- Stripe signature verification through SDK `constructEvent`, event recording and replay paths.
- Provisioning payment status checks, per-instance locking, and staged lifecycle entries.
- Panel client keys kept server-side and scoped by panel customer identity.
- Existing integration tests for tenant isolation, instance operations, subscription lifecycle and backup-related scripts.

These are positives in architecture, not a blanket security certification. One critical distinction: tests that mock Pterodactyl do not establish that Docker/Wings isolations are secure on the real host.

## 5. Release gates

A commercial release is **NO-GO** if any of the following is missing:

1. All CI jobs on the exact release SHA pass, including dependency and secret scanning.
2. A real WebSocket handshake from an unauthorized origin is refused, and a first-party browser console still connects.
3. An independent two-tenant authorization test covers files, commands, invoices, domains, backups, API credentials, admin functions and WebSocket console.
4. At least 20 sequential complete test-mode order → payment → provisioning → activation flows succeed; duplicate/out-of-order delivery and simulated worker crashes do not produce duplicates.
5. No unpaid order can provision or upgrade paid resources.
6. All active catalog products are installed and validated from scratch on staging.
7. Stripe reconciliation agrees with actual provider payment/refund/subscription states.
8. A fresh off-provider backup is actually restored on an isolated host, including service volumes and required secrets.
9. Management ports are private; Proxmox, Wings, database, Redis, Caddy admin and mail management paths are reviewed with network evidence.
10. External TLS and public customer-app routing work end to end.
11. SMTP verification, reset, invoice and support alerts are delivered to real external inboxes.
12. Status pages and documentation describe only verified operational behavior.
13. Production migration rehearsal on a restored database succeeds with rollback and recovery procedures documented.
14. Deployment records the new commit SHA, includes post-deploy smoke tests and a defined incident owner.
15. Legal/commercial review and support/abuse procedures are completed.

## 6. Execution status and next steps

**Implemented in audit branch:** SEC-01 through SEC-05, plus focused regression tests.

**Not done in this source-only session:** production redeploy, full host hardening, external backup drill, real-browser end-to-end checks, real charge/refund, full catalog probes, complete legal review, and exhaustive pentest.

**Next engineering action:** Review the PR and CI results. Fix any failures before considering a merge. Do not run installation/migration scripts or change production automatically.

**Next operator action:** Configure `TRUSTED_PROXIES` for the actual Caddy/Cloudflare deployment; enable branch protection, verify off-provider backups and rotate any previously exposed origin/panel secrets.

**Final decision: NO-GO** until the operator evidence in section 5 is recorded. Source changes reduce risk; they do not prove the platform ready to hold third-party customer data.


## 7. Round 2: deeper payment, capacity, encryption and CI review

This section supersedes the initial "SEC-01 through SEC-05 only" implementation
snapshot above. It records additional issues found by examining the code
paths and GitHub Actions logs. No production service was modified.

### Additional source-confirmed defects patched

| ID | Priority | Evidence | Patch / regression |
| --- | --- | --- | --- |
| FIN-02 | P1 | `api/src/routes/webhooks.ts` used unconditional `FAILED` writes for asynchronous Checkout or PaymentIntent failure, even when payment was already successful | Conditional transitions; stale event tests in `stripe-webhook.test.ts` |
| FIN-03 | P1 | `api/src/services/stripe.ts` read order status and wrote PAID later without atomic status check; promotion redemption was separate | Compare-and-set in transaction; promotion race test |
| FIN-04 | P1 | `api/src/routes/orders.ts` cancellation could overwrite a concurrent paid transition; repeated cancellation issued redundant notifications | Conditional update, true idempotency and cancellation tests |
| FIN-05 | P1 | Expired checkout event could overwrite concurrently paid order | Conditional expiration claim |
| FIN-06 | P1 | `refundPayment` ignored Stripe Refund status, treating accepted-but-pending refunds as completed | Only `succeeded` marks local REFUNDED; pending/failure returns false and records audit metadata. Further provider reconciliation is required |
| FIN-07 | P1 | `settleFreeUpgradeOrder` could mark CANCELLED/REFUNDED or payable orders PAID | Check ownership, UPGRADES only, zero cost, actual instance, and conditional transition; tests |
| CAP-01 | P1 | `nodeCpuCapacity` excluded every CANCELLED instance even while the node allocation still existed | Count all node-associated allocations until their node id is cleared; regression test |
| CRYPTO-01 | P1 | AES-GCM key for panel credentials and customer variables derived solely from SESSION_SECRET, so a normal session rotation would orphan secrets | Versioned v2 encryption using separate DATA_ENCRYPTION_SECRET with v1 legacy support; dry-run-first operator migration and tests |
| CI-01 | P2 | Several tests were based on outdated rate-limit assumptions or mocks lacking eggVariableSpecs; domain routing assumed a particular order | Corrected three test files without disabling test coverage |
| CI-02 | P1 launch | Gitleaks v3 on pull_request failed due to missing GITHUB_TOKEN and misplaced action inputs | Workflow action now receives token and settings as environment variables |

### CI evidence (first audit run)

On `cbb6966c`, GitHub Actions completed with 8 failed tests and 1,106
passing tests. Failures were: one outdated rate-limit expectation, six tests
with a missing Pterodactyl mock export, and one ordering-sensitive domain
routing assertion. The errors were read from the workflow's job log and the
tests were adjusted in subsequent commits.

After additional security changes, the run on `3155ca4c` revealed that
the Gitleaks PR action required GITHUB_TOKEN. The failure did not establish
that a secret was found. The workflow wiring was then fixed.

**Never treat these prior runs as confirmation that the final HEAD passes.**
Use the final SHA's own CI run results as launch evidence.

### Important open engineering risks requiring design work

- **CAP-02 (P1):** `chooseNode()` checks CPU using a read from the database,
  while the BullMQ provisioning worker has concurrency 2 and the allocation
  is recorded later. Different instances can therefore observe the same
  free capacity. A durable per-node reservation or cross-worker
  synchronization scheme is needed, with parallel provisioning tests.
- **PROV-02 (P1):** The provisioning lock is a timestamp with a 30-minute TTL,
  with no demonstrated heartbeat/fencing token across long-running
  provisioning. A stale holder might overlap with a recovery worker.
- **FIN-08 (P1):** Asynchronous Stripe refunds now fail closed but still
  require reconciliation on `refund.updated`/`refund.failed` and a durable
  refund-state ledger so operators can finish pending cases without
  duplicate refunds.
- **FIN-09 (P1):** Concurrent upgrades on the same instance need exclusive
  per-instance financial and provisioning control to prevent conflicting
  active quotes/orders and resource changes.
- **SEC-06 (P1 policy):** Administrator MFA/step-up and distributed
  anti-brute-force counters need verification before real-money launch.
  Existing in-process failed-attempt counters are not shared across replicas.
- **OPS-03 (P1):** GitHub reports main branch protection disabled. Enable
  required checks, no direct pushes and review/approval; app-code CI cannot
  enforce repository rules itself.
- **DR-03 (P0 operational):** A completed restore of encrypted platform
  backups *and customer volumes* on a host at another provider remains
  unverified, as do recovery keys and RTO/RPO.
- **TLS-03 (P1):** Current wildcard customer-app TLS and customer-origin
  routability have not been tested externally on this exact release.
- **CRYPTO-02 (P1 rollout):** v2 encryption must be deployed to all API and
  worker processes before operator migration, followed by a complete dry
  run and database backup. No credential re-encryption was executed by this
  audit. Older code cannot read v2 ciphertext, so the rollback plan is
  constrained.

### Public website check

The website served at `https://blipmade.com/` on 30 October 2026
still states that card payment is not available and orders are completed
manually. This is consistent with the operator's statement that the new
release has not been deployed. The public product pages explicitly label
some unavailable apps as not deployable. The status and documentation URLs
could not be inspected with the available public fetch tool, so no claim of
availability or unavailability is made from that result alone.

### Updated recommendation

Do not merge into main or deploy until the final PR CI is green, source
review comments are resolved, and the engineering plus operator gates above
are fulfilled. The targeted fixes are real code changes, not a complete
penetration-test certificate. The commercial release verdict remains **NO-GO**.
