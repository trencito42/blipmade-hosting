# Backlog checkpoint

resume_sha: work/disable-checkout CRM engine unify + firstPaid + referral 400 + campaign worker
production_before: 7db4de34b (catalog rollback Admin). Next: hide Game tab for unsupported products.
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

missing_for_github_close:
  live staff Playwright against production session (needs E2E_STAFF_*)
  live Stripe tax/credit posting (PAYMENTS_ENABLED false)
  live marketing send (MARKETING_DELIVERY_ENABLED false)
  Discord production post (forbidden)
  GitHub issue write

next_executable:
  catalog preset rollback Admin button + structure test, then remaining #19/#22/#18/#21/#24/#25/#26/#27 under flags-off

ci: GitHub Actions not listed from this host (no gh). Confirm on github.com after push.

external:
  SMART_DEPLOY_SANDBOX
  CF SaaS entitlement
  GAME_CONNECT client
  registrar live
