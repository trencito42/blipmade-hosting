# 24 — Coverage matrix

Production target: `8b07cd2d` on VM103. Code reads used `/root/work` @ `952b7492` unless noted. Dirty Deploy Studio **excluded** from production claims.

| Domain | Inspected | Functionality | Evidence | Tests | Findings | Blind spots | Confidence |
|---|---|---|---|---|---|---|---|
| Scope/docs | AGENTS, handoff, known issues, roadmap, README, DR | Claims vs live | Read | n/a | BM-014 | Issue comments | High |
| Topology | qm, ssh, NAT, compose | 6 infra VMs + 2 VPS | Live 06:28Z | n/a | BM-001 | CF origin internals | High |
| Infra | RAID, SMART, timers, docker | Host/VMs | Live | n/a | BM-005,008–011 | apt CVE list | High |
| Security | auth, csrf, secrets, oauth, operations, zip, 3306/8006 TCP | Cookies, CSRF, encryption, OAuth state/PKCE, lateral | Code + TCP | guest tests read | BM-003,007,010,013,017,022 | Live IDOR with two accounts | Med |
| Billing | env, stripe.ts, catalog tax, webhooks amounts, orders zero-total | Live checkout path, VAT skip, webhook ledger | Code + health + flags | not executed | BM-002,012,015 | Dashboard charges, refunds live | High for config; none for money moved |
| Deploy/catalog | catalog.ts, readiness-gate, /apps browser, public API | 75 products, 59 orderable | API+browser | site-catalog.test.ts read | BM-015,019,020 | Wizard E2E logged-in | Med |
| Provision | git-deploy, worker timers, eggs API | Queues, egg done | Live eggs 83 | not run | BM-004,013 | Full install on disposable node | Med |
| Games | Wings 1.13.4, 6 containers, catalogue blockers | COMING_SOON vs DEPLOYABLE | API+ssh | not run | BM-004,015 | Client join, world backup | Med |
| VPS | vps.ts configureVm, qm, offsite-vps | clone, no onboot, weekly dump | Live+code | not run | BM-009,011,016 | SSH into customer VPS | Med–High |
| Email/DNS | catalog EMAIL, MAIL_SALES, dig MX/SPF/DMARC | Sold; SPF ~all; DMARC quarantine | Live | not run | BM-018,021 | DKIM selector, IMAP login | Med |
| Support | guest routes, ChatWidget, instance-help | claim 401 expected; diagnose reads files | Code | support-guest.test.ts | BM-022 | Live ticket, Discord bridge | Med |
| Admin 3.0 | nav.ts, routes.tsx admin, staff-lifecycle | Invite/grant/remove exist; huge nav | Code | e2e stubs only | BM-020 | Click-every-page | Low–Med |
| Customer UX | login, /apps, nav, routes | Login, 49 vs 59, dual services | Browser+code | n/a | BM-019,020 | Logged-in app, mobile widths | Med |
| CRM | DeviceSignal, CustomerNote, promotions | Notes+risk hash exist; no campaign CRM | Schema | n/a | — | Issue #28 text (gh missing) | Med |
| Database | schema uniques, cascades | Webhook unique; user cascade deletes orders | Schema | migrate diff not run | cascade note in 15 | Live drift | Med |
| Performance | disk, VPS slots, NAT ports | 85% disk; 150 VPS slots | Live+code | no load test | BM-005,016 | API p95 | Med modeled |
| Backup | offsite agent, receipts, timers | DB nightly; VPS weekly verified; mail none | Live | restore drill stale | BM-001,006,021 | Decrypt identity | High |
| CI | ci.yml full test job | vitest on _test DB, mocks panel | File | Actions run UNVERIFIED | — | Current GitHub run | Med |
| Product | catalogue size, prices, copy | Too many SKUs vs one node | API+browser | n/a | BM-015,019,020 | Unit economics | Med |

**Authenticated customer/admin click-through:** BLOCKED (no authorized test session). Public `/app/deploy` redirects to login. `/apps` walked.

**Chaos (API/DB/host reboot):** not executed; design only.
