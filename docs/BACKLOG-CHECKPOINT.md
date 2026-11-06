# Backlog checkpoint

release: continue-from 62ec3edf then this commit
flags:
  PAYMENTS_ENABLED: false
  MAIL_SALES_ENABLED: false
  GAME_CONNECT_ENABLED: false
  DOMAIN_COMMERCE_ENABLED: false
  CF_SAAS_ENABLED: false
  MAIL_DNS_WRITES: false
  MARKETING_DELIVERY_ENABLED: false
  SMART_DEPLOY_SANDBOX: unset (builds stay planned)

next:
  - Owner: Stripe live / VAT legal / CF SaaS entitlement / registrar contract / GAME_CONNECT client proof / marketing send
  - Isolated builder host SMART_DEPLOY_SANDBOX
  - GitHub issues:write to close after remaining external AC
