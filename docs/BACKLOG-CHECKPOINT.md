# Backlog checkpoint

resume_sha: pending this commit
production_sha: f8b006b44939b6c995ddb77d3e0d8c629850a5c2
production_verified: VM103 `/opt/blipmade` was clean at `f8b006b4`; all five containers healthy; smoke 38/38
ci_last_green_before_session: https://github.com/trencito42/blipmade-hosting/actions/runs/42287012366 (`71179bd1`)
ci_failure_classified: run 42312990170 at `f8b006b4` failed schema drift and 54 tests in six mock-heavy files
ci_fix: coupon duration code no longer imports the full pricing/provider graph; MarketingCampaign schema declares the scheduled dispatch index already created by migration 20261107013000
flags_unchanged:
  PAYMENTS_ENABLED: false
  MAIL_SALES_ENABLED: false
  GAME_CONNECT_ENABLED: false
  DOMAIN_COMMERCE_ENABLED: false
  CF_SAAS_ENABLED: false
  MAIL_DNS_WRITES: false
  MARKETING_DELIVERY_ENABLED: false

milestones_published_not_deployed:
  85e99d69: "#19" Advanced instance workspaces grouped by responsibility; permission filtering and deep links preserved
  72de06fb: "#22" Add-on Center Installed/History UI and safe update cleanup with locked backup recovery
  9e56c768: "#18" deterministic root Go and Rust import detection; ambiguous layouts fail closed
  pending_this_commit: CI regression and schema-drift repair

verification_this_session:
  production_smoke: 38/38 at production SHA `f8b006b4`
  web_unit: 514 passed, 3 skipped
  web_build: passed
  web_e2e_advanced_and_deploy: 8/8
  web_e2e_addon_center: 1/1
  api_addon_lifecycle: 16/16 on VM103 bench
  api_import_runtime: 13/13 on VM103 bench
  api_ci_regression_files: 76/76 on VM103 bench
  api_promotion_coupon: 5/5 on VM103 bench
  api_test_typecheck: passed on VM103 bench
  prisma_schema_drift: no difference detected on VM103 shadow database

issue_status:
  19 PARTIAL: customer navigation and Minecraft capability gating are implemented; non-Minecraft game-aware operations and real server proof remain
  22 PARTIAL: install/update state, history, safe artifact replacement and customer UI are implemented; profiles/repurpose acceptance and real Pterodactyl proof remain
  18 PARTIAL: import inspection supports Node/Python/PHP/Go/Rust and records isolated jobs; no disposable sandbox executor has been proven end to end
  21 PARTIAL: proration, credits and coupon term mapping exist in test-mode paths; owner financial/legal approval and production activation remain absent
  20 PARTIAL: canonical catalog, draft presets and rollback exist; publish validation, Discord variants and real installation evidence remain
  24 PARTIAL: Smart Connect registry and guarded implementation exist; flag remains off and no real game client has verified it
  26 PARTIAL: DNS/mail preview and approval paths exist; live provider writes remain disabled and unverified
  25 PARTIAL: Cloudflare for SaaS lifecycle contracts exist; paid entitlement and live hostname/certificate proof remain unavailable
  27 PARTIAL: deterministic `.example` fixtures and lifecycle contracts exist; no approved registrar or live commerce path is connected
  28 PARTIAL: CRM facts, campaigns, automations and referrals have isolated coverage; remaining independently testable Admin/E2E criteria need completion

next_executable:
  1. Publish the pending CI repair and require the latest GitHub Actions run to finish green.
  2. Continue #19 with the missing non-Minecraft configuration operations and customer/Admin acceptance tests.
  3. Continue #22 profiles/repurpose, preserving backup and compatibility gates.
  4. Continue #18 sandbox dispatch using only disposable infrastructure; never execute imported archives in the API process.

constraints:
  No production deploy was performed. No kill switch, credential, DNS record, price, subscription or customer server was changed.
