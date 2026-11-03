# Operator actions (human only)

Task C is deployed. Download destinations are currently allowlisted through the existing exact `PANEL_NODE_ADDRESSES` mapping. If Wings/object storage returns any other HTTPS `host[:port]`, add it explicitly to `PTERODACTYL_DOWNLOAD_HOSTS`; never use wildcards. Large-file/interruption staging validation remains.

The new versioned data-encryption code is deployed in legacy-compatible mode. Generate and configure an independent `DATA_ENCRYPTION_SECRET`, then run the documented dry-run-first migration under a separate explicit approval. The implementation agent did not generate a production key or run re-encryption.

1. Rotate the MiniMax API key pasted in chat earlier; enter new key as `SUPPORT_AI_API_KEY` in `/opt/blipmade/.env` on VM103.
2. Fill platform legal/support settings: error page and legal pages show `TODO(operator): the support email address` (admin platform settings `billing.support_email`).
3. Issue #21 resize billing: finance/legal sign-off + Stripe reconciliation test before enabling.
4. Issue #23 Cloudflare DNS: provide Cloudflare API credentials/zone decisions; no NS migration without approval.
5. Production is on `main` at `580bbc0`. The catalogue-structure migration is applied and the public catalogue is unchanged. Give a fresh explicit approval for every later production deploy; never merge the obsolete audit branch.
6. GlitchTip: mark issues 13 and 18 Resolved; check 16/17 for new events.
7. Dependabot major bumps (prisma 7, stripe 23, xterm 6) were closed on GitHub; decide when to schedule upgrades.
