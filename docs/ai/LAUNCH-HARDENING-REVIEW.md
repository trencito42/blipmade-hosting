# Launch-hardening branch review

Source: `audit/launch-hardening-2026-10-30` (56 commits absent from the starting `main` by patch-id). Review target: current `main`. The old branch was never merged; selected behavior was ported by hand onto the current code and tests.

Legend: **PORTED** — applied or adapted to current main; **PRESENT** — equivalent behavior/test already existed; **SUPERSEDED** — an intermediate/stale artifact whose final behavior is covered by another port or current documentation.

| Commit | Classification | Decision/evidence |
|---|---|---|
| `c68b2a1` | PORTED | Exact WebSocket origin parser/allowlist. |
| `8408bf5` | PORTED | WebSocket origin unit coverage. |
| `a378c48` | PORTED | Pre-upgrade origin/auth guard and command-content redaction. |
| `b7d7918` | PORTED | Atomic password-reset token claim. |
| `945a7cc` | PORTED | Concurrent reset/replay tests. |
| `6a7cb6a` | PORTED | Command secrets absent from event/audit persistence. |
| `dfa1a1c` | PORTED | Atomic email-verification token claim. |
| `bfaa1ce` | PORTED | Concurrent verification test. |
| `685be5c` | PORTED | Rate-limit key uses Fastify-resolved IP, never TCP source port. |
| `ff778d6` | PORTED | Trusted/untrusted proxy limiter tests. |
| `702d967` | PORTED | Cryptographic Pterodactyl bootstrap password. |
| `7225311` | PORTED | Bootstrap entropy/shape test. |
| `38cdbbc` | PORTED | Trusted-proxy boundary documentation corrected. |
| `cbb6966` | SUPERSEDED | Stale branch-specific no-go report; current `docs/ai/*`, this review and operator actions carry the live evidence without importing an obsolete baseline snapshot. |
| `4203de6` | PORTED | Remaining rate-limit regression expectation updated. |
| `163f143` | PRESENT | `eggVariableSpecs` mock already exists in current `starter-port.test.ts`. |
| `b5fc426` | PRESENT | Domain-route assertion already compares the sorted hostname set. |
| `38493ee` | PORTED | Stale Stripe failures only transition waiting orders/payments. |
| `b24c3bf` | PORTED | Paid/refunded out-of-order webhook regression coverage. |
| `7c99122` | PORTED | Paid transition and promotion redemption are one compare-and-set transaction. |
| `40b546b` | PORTED | Cancellation is conditional and idempotent. |
| `77dba07` | PORTED | Checkout expiry conditionally claims a waiting order before releasing promotion state. |
| `02b9a81` | PORTED | Cancellation/reconciliation regressions. |
| `8757836` | PORTED | Concurrent promotion redemption regression. |
| `1bd8303` | PORTED | CPU remains reserved while a node allocation exists. |
| `16ccbd1` | PORTED | Cancelled-but-allocated capacity test. |
| `571a6db` | PORTED | Free-upgrade settlement checks ownership/type/amount/status. |
| `301743b` | PORTED | Free settlement also requires a real instance. |
| `3bd0f39` | PORTED | Free-upgrade bypass/terminal-state tests. |
| `0780e91` | PORTED | Independent `DATA_ENCRYPTION_SECRET` configuration. |
| `bbb0367` | PORTED | Versioned v1/v2 authenticated encryption and fail-closed reads. |
| `e212b05` | PORTED | Dry-run-first re-encryption script. |
| `bfa70ee` | PORTED | Typed conditional migration updates; extended for current TOTP and Git webhook secret holders. |
| `f45f568` | PORTED | Session-key rotation/incorrect-key tests. |
| `3155ca4` | PORTED | Safe two-phase operator runbook; migration remains unexecuted. |
| `793261c` | PORTED | Gitleaks v3 receives `GITHUB_TOKEN` via environment. |
| `8d9008f` | PORTED | Local refund state changes only after provider status `succeeded`. |
| `15943f8` | PORTED | Pending-refund test and audit evidence. |
| `198a644` | SUPERSEDED | Historical branch audit snapshot; its live controls/blockers are represented in current status, test status and operator actions. |
| `c022b5e` | PRESENT | Current Stripe service already uses `nextInvoiceNumber()` for provider invoice creation. |
| `4e55a90` | PORTED | Concurrent invoice-number regression restored. |
| `4ba7728` | PORTED | Paid-event replay reconciles a missing local invoice. |
| `63f5b22` | PORTED | Missing-invoice replay test. |
| `a51210a` | PORTED | Bounded-memory stream foundation, adapted to the final signed-URL contract. |
| `0931f1d` | PORTED | Browser disconnect destroys the upstream download stream. |
| `afa63ae` | SUPERSEDED | Initial direct-stream test replaced by final signed-URL/SSRF stream coverage. |
| `135049a` | SUPERSEDED | Intermediate typing fix included in the final typed stream test. |
| `b135a1f` | PORTED | Admin refund mock reports provider-confirmed success. |
| `2391503` | PORTED | Upgrade refund mock reports provider-confirmed success. |
| `67fb952` | PORTED | Buffered binary branch removed from the Pterodactyl client. |
| `310047c` | PORTED | Exact signed-download host allowlist configuration. |
| `7376b1c` | PORTED | Resolve signed envelopes, validate each redirect and stream real bytes. |
| `aeac068` | PORTED | Signed-link, stream, credential-boundary and SSRF tests. |
| `ad0132c` | PORTED | Operator documentation and staging validation requirements. |
| `a1b06f7` | PORTED | Typed fetch/arrayBuffer spy in final download test. |
| `c2af0f6` | PORTED | Provider-success refund mock reset. |

## Verification boundary

API typecheck passes at every port checkpoint. Runtime API/race tests were not run because this workspace has no disposable `TEST_DATABASE_URL`/`DATABASE_URL`, Redis URL, or session secret. The encryption migration was not run. No Stripe action, payment/refund reconciliation, deployment, merge, external message, or production mutation was performed.

Before deploy, the owner/operator must provide the disposable test stack and run the full API suite, configure and validate `PTERODACTYL_DOWNLOAD_HOSTS`, stage the credential-encryption rollout/dry run with backups, and approve the security/billing release explicitly.
