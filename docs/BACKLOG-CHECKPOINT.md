# Backlog checkpoint

resume_sha: work/disable-checkout (P0 addon fail-closed + mail DNS provider path)
production_before: 9d9678db08d6240203f4227dee0f3554ae24210b
flags:
  PAYMENTS_ENABLED: false
  MAIL_SALES_ENABLED: false
  GAME_CONNECT_ENABLED: false
  DOMAIN_COMMERCE_ENABLED: false
  CF_SAAS_ENABLED: false
  MAIL_DNS_WRITES: false
  MARKETING_DELIVERY_ENABLED: false

p0_addon:
  persist job before backup
  idempotency replay succeeded, retry failed, lock pending/running
  wait for backup completion; fail on timeout/fail/missing
  Paper/Folia only for Bukkit; Forge refused
  live MINECRAFT_VERSION/MC_VERSION required
  listFiles confirm before manifest
  delete errors not swallowed

p0_mail_dns:
  MAIL_DNS_WRITES false → preview_only applied false
  no zone → provider_unavailable applied false
  applyMailDns never HTTP applied
  Cloudflare publish + re-read when writes on

ci_787: web admin-nav count 33 vs 35 (CRM + domains commerce). Local API 221 passed, 1896 tests. Nav test now 35.

external:
  SMART_DEPLOY_SANDBOX
  CF SaaS entitlement
  GAME_CONNECT client
  registrar live
  GitHub issue close (write permission)
