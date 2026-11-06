# Backlog checkpoint

resume_sha: b3e493f8a80c5ee73864406e27f51271a0b7c228
production_sha: b3e493f8a80c5ee73864406e27f51271a0b7c228
flags:
  PAYMENTS_ENABLED: false
  MAIL_SALES_ENABLED: false
  GAME_CONNECT_ENABLED: false
  DOMAIN_COMMERCE_ENABLED: false
  CF_SAAS_ENABLED: false
  MAIL_DNS_WRITES: false
  MARKETING_DELIVERY_ENABLED: false

crm_issue_28:
  compiler: empty AST throws, unknown facts refused, op/type checks, depth/node caps
  graph: unique ids, yes+no branches, cycles, unreachable, MAX_STEPS, appliedNodes skip
  family: resolvePromotion uses quote item slugs; unknown family fail closed
  risk: risk.read / risk.write; no customers.read leak
  analytics: yearly/12 MRR; firstPaid = MIN(paidAt) in range, not distinct payers
  facts: all instances + CatalogVariant families; event derive + repairStaleFacts
  events: registration, email_verified, first_purchase, ticket_opened
  worker: resumeWaitingAutomations 10s, repairStaleFacts 5m, dispatchDueCampaigns 60s
  campaigns: queueCampaign shared by route+worker; consent/frequency; planned not sent
  automations: POST /run uses runAutomation (same crash-safe engine as worker)
  referrals: lookupReferralCode before create; invalid code 400; qualify on first_purchase; reverse on refund
  stripe_coupon: repeating + duration_in_months when recurringPeriods > 0 (months, not yearly)
  discord: planCommunityAnnouncement memory/off; delivered always false
  tests: crm.test + crm-ops + Playwright stub desk (announce)

shipped_this_slice:
  247f4170 CRM engine unify, firstPaid, referral 400, campaign worker, Discord memory adapter
  7db4de34 Admin preset rollback UI + catalog-structure test
  b3e493f8 hide Game tab unless product has GAME_WORKSPACES

missing_for_github_close:
  live staff Playwright (needs E2E_STAFF_* on isolated bench)
  live Stripe tax/credit posting (PAYMENTS_ENABLED false)
  live marketing send (MARKETING_DELIVERY_ENABLED false)
  Discord production post (forbidden)
  GitHub issue comments (no gh on this host)

issues:
  28 not closed (live send / Stripe / staff E2E still owner)
  20 not closed (0 orderable SKUs; rollback Admin now exists; commercial publish still gated)
  19 Game tab hidden for unsupported slugs; Minecraft Java stays on Minecraft tab
  22 18 21 24 25 26 27 remain flags-off with isolated adapters; no live entitlements

next_executable:
  authenticated Playwright bench if E2E_STAFF_* exists; else vendor-sandbox work only when credentials exist

ci: GitHub Actions not listed from this host (no gh)

external:
  SMART_DEPLOY_SANDBOX
  CF SaaS entitlement
  GAME_CONNECT client
  registrar live
