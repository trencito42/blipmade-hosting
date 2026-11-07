# Backlog checkpoint

resume_sha: pending this commit
production_sha: f8b006b44939b6c995ddb77d3e0d8c629850a5c2
production_verified: VM103 `/opt/blipmade` was clean at `f8b006b4`; all five containers healthy; smoke 38/38
ci_last_green_before_session: https://github.com/trencito42/blipmade-hosting/actions/runs/42319056690 (`c685f77f`)
ci_failure_classified: run 42312990170 at `f8b006b4` failed schema drift and 54 tests in six mock-heavy files
ci_fix_published: 460832e8; coupon duration code no longer imports the full pricing/provider graph; MarketingCampaign schema declares the scheduled dispatch index already created by migration 20261107013000
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
  460832e8: CI regression and schema-drift repair
  c685f77f: "#19" server-owned effective capability manifest and permission-correct shared console
  pending_this_commit: "#22" immutable reproducible profiles, durable activation jobs and explicit recovery

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
  web_e2e_capability_navigation_and_viewer_console: 10/10
  api_capabilities_and_shared_console: 19/19 on VM103 bench
  api_profile_activation_and_instance_regression: 38/38 on VM103 bench
  api_profile_artifact_capture: 1/1 on VM103 bench
  web_profile_activation_e2e: 1/1
  prisma_profile_activation_migration: applied and schema validated on VM103 bench

issue_status:
  19 PARTIAL: a server-owned manifest now drives product-family navigation and deployment/access availability; shared viewers can read console output but cannot send commands, and the owner panel credential is used throughout; non-Minecraft game-specific configuration operations and real server proof remain
  22 PARTIAL: immutable snapshots pin catalogue identity, Modrinth release IDs, runtime/dependencies and read-back SHA-256; durable idempotent per-instance activation jobs perform verified locked backup, staging, checksum verification and explicit recovery, with customer/Admin UI. Legacy/preset files without immutable checksums are refused. Real disposable-Pterodactyl activation and Repurpose restore/revert proof remain
  18 PARTIAL: import inspection supports Node/Python/PHP/Go/Rust and records isolated jobs; no disposable sandbox executor has been proven end to end
  21 PARTIAL: proration, credits and coupon term mapping exist in test-mode paths; owner financial/legal approval and production activation remain absent
  20 PARTIAL: canonical catalog, draft presets and rollback exist; publish validation, Discord variants and real installation evidence remain
  24 PARTIAL: Smart Connect registry and guarded implementation exist; flag remains off and no real game client has verified it
  26 PARTIAL: DNS/mail preview and approval paths exist; live provider writes remain disabled and unverified
  25 PARTIAL: Cloudflare for SaaS lifecycle contracts exist; paid entitlement and live hostname/certificate proof remain unavailable
  27 PARTIAL: deterministic `.example` fixtures and lifecycle contracts exist; no approved registrar or live commerce path is connected
  28 PARTIAL: CRM facts, campaigns, automations and referrals have isolated coverage; remaining independently testable Admin/E2E criteria need completion

next_executable:
  1. Publish the pending #22 profile milestone and require the exact GitHub Actions run to finish green.
  2. Prove profile activation and Repurpose backup/restore/revert on a disposable Pterodactyl server only; never a customer server.
  3. Continue #18 sandbox dispatch using only disposable infrastructure; never execute imported archives in the API process.
  4. Continue #19 non-Minecraft adapters and role tests after the executor milestone.

constraints:
  No production deploy was performed. No kill switch, credential, DNS record, price, subscription or customer server was changed.
