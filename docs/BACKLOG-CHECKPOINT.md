# Backlog checkpoint

resume_sha: work/disable-checkout CRM fail-closed compiler, graph, family, risk RBAC
production_before: 428eacb5e6f8773c6907b77bca80f0f867847723
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
  analytics: yearly/12 MRR snapshot vs period collected/refund/tax
  facts: all instances + CatalogVariant families; event derive + repairStaleFacts
  events: registration, email_verified, first_purchase, ticket_opened
  worker: resumeWaitingAutomations 10s, repairStaleFacts 5m
  campaigns: consent/frequency at queue; planned not sent while delivery off
  tests: crm.test + crm-ops (250 audience) + Playwright stub desk

missing_for_github_close:
  live staff Playwright against production session
  live Stripe tax/credit posting (PAYMENTS_ENABLED false)
  live marketing send (MARKETING_DELIVERY_ENABLED false)
  GitHub issue write

external:
  SMART_DEPLOY_SANDBOX
  CF SaaS entitlement
  GAME_CONNECT client
  registrar live
