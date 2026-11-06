# Backlog checkpoint

resume_sha: work/disable-checkout CRM growth platform (after ae3f0a3)
production_before: ae3f0a3cf5fedf111850ac84047ae01fd941e8ef
flags:
  PAYMENTS_ENABLED: false
  MAIL_SALES_ENABLED: false
  GAME_CONNECT_ENABLED: false
  DOMAIN_COMMERCE_ENABLED: false
  CF_SAAS_ENABLED: false
  MAIL_DNS_WRITES: false
  MARKETING_DELIVERY_ENABLED: false

crm_issue_28:
  facts: namespaced registry, derive from billing/tickets/discord/oauth/consent
  segments: nested AND/OR, compileSegmentWhere (no take 200)
  campaigns: studio + queue with per-recipient consent, Discord DMs refused
  automations: persistent graph, wait, branch, dedupe, delivery off
  promotions: segment/first-purchase/private gates in resolvePromotion
  risk: evaluation history + overrides, shadow, no auto-reject
  analytics: real aggregates only
  ui: /admin/crm tabs + customer Growth 360
  campaignMayDeliver: never hardcoded marketingConsent true on approve

missing_for_github_close:
  E2E browser journeys against a staff session
  live Stripe tax/credit posting (PAYMENTS_ENABLED false)
  live marketing send
  GitHub issue write

external:
  SMART_DEPLOY_SANDBOX
  CF SaaS entitlement
  GAME_CONNECT client
  registrar live
