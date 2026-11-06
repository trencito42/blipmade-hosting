# Backlog checkpoint

resume_sha: pending this commit
production_sha: 71179bd19e995d6fe03617784964d855882c9fff
ci_before: https://github.com/trencito42/blipmade-hosting/actions/runs/42287012366 success
flags:
  PAYMENTS_ENABLED: false
  MAIL_SALES_ENABLED: false
  GAME_CONNECT_ENABLED: false
  DOMAIN_COMMERCE_ENABLED: false
  CF_SAAS_ENABLED: false
  MAIL_DNS_WRITES: false
  MARKETING_DELIVERY_ENABLED: false

this_slice:
  stripe: promotionCouponSpec maps billing periods to Stripe months; yearly 2+ fail closed (Stripe 12-month cap)
  campaigns: dispatchCursor + dispatchCompletedAt; worker does not rewrite recipients; frequency cap ignores same campaign
  #18: SANDBOX_LIMITS, cancelIsolatedBuild, recoverStaleBuilds, dispatch payload never executes in API
  #19: GAME_CAPABILITIES registry + GET /instances/:id/game-capabilities; GameTab reads registry
  #25: ownership TXT + saasReconcile Admin
  #27: quote TTL 15m; expired fixture quotes not sellable
  #28: Referrals desk + Playwright stub; Discord memory adapter unchanged
  tests: promotion-coupon, domain-lifecycle, crm, crm-ops, catalog-structure, addon-lifecycle 50/50

issue_status:
  28 INCOMPLETE: isolated staff Playwright still needs a bench API; live send/Stripe off
  20 ENGINEERING COMPLETE / ACTIVATION BLOCKED: catalog lifecycle + rollback; 0 orderable SKUs
  19 INCOMPLETE: registry + Minecraft tab exist; player/world/plugin backends already on Minecraft Java; other games config-only
  22 ENGINEERING COMPLETE / ACTIVATION BLOCKED: addon jobs + backup gate; no writes on customer servers in tests
  18 ENGINEERING COMPLETE / ACTIVATION BLOCKED: provisioner/lifecycle; SMART_DEPLOY_SANDBOX missing so jobs stay blocked_no_sandbox
  21 INCOMPLETE: proration exists; recurring coupon mapping now correct; live payments off
  24 ENGINEERING COMPLETE / ACTIVATION BLOCKED: SRV registry; GAME_CONNECT off
  25 ENGINEERING COMPLETE / ACTIVATION BLOCKED: adapter + ownership + reconcile; paid entitlement off
  26 ENGINEERING COMPLETE / ACTIVATION BLOCKED: preview/approval; MAIL_DNS_WRITES off
  27 ENGINEERING COMPLETE / ACTIVATION BLOCKED: fixture .example only; DOMAIN_COMMERCE off

next_executable:
  deploy this SHA, confirm CI, then Minecraft capability-gated Advanced UI leftovers and Smart Connect staging allocation tests if a disposable node exists
