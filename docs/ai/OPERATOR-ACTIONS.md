# Operator actions (human only)

Before deploying Task C, set `PTERODACTYL_DOWNLOAD_HOSTS` to the exact approved HTTPS `host[:port]` values returned by Wings/object storage. Do not use wildcards. Validate file/backup streaming and interruption in staging; a missing allowlist makes downloads fail closed. No value was inferred or written by the implementation agent.

1. Rotate the MiniMax API key pasted in chat earlier; enter new key as `SUPPORT_AI_API_KEY` in `/opt/blipmade/.env` on VM103.
2. Fill platform legal/support settings: error page and legal pages show `TODO(operator): the support email address` (admin platform settings `billing.support_email`).
3. Issue #21 resize billing: finance/legal sign-off + Stripe reconciliation test before enabling.
4. Issue #23 Cloudflare DNS: provide Cloudflare API credentials/zone decisions; no NS migration without approval.
5. Approve merge of `audit/admin-master-spec-20261103` into `main` and production deploy for each batch (deploys so far were approved per batch).
6. GlitchTip: mark issues 13 and 18 Resolved; check 16/17 for new events.
7. Dependabot major bumps (prisma 7, stripe 23, xterm 6) were closed on GitHub; decide when to schedule upgrades.
