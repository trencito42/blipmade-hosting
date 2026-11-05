# Operating rules for the next AI agent

These come from the owner (Stefan; writes Romanian, informal; wants short reports and autonomous work). They override convenience.

## Hard rules
1. **No production deployment without the owner's explicit word in chat** ("deploy"). Before it: compare `main` with what runs on VM103, name the commits and migrations, run `bash scripts/deploy.sh` alone (never chained with a publish).
2. **Never touch production `.env`, Stripe keys, live DNS, prices, subscriptions or customer servers.** Do not restart the live API outside the deploy script. Do not enable a feature flag in production (`GAME_CONNECT_ENABLED`, `PAYMENTS_ENABLED`...) unless told.
3. **Stripe: test mode only**, in an isolated environment (bench database, fake panel). No real payments or refunds. #21 stays open until the owner's financial and legal sign-off; never activate it in production.
4. **Secrets never go in chat, files, commits or issue comments.** Env var names only. If a secret appears in chat, tell the owner to rotate it. If you cannot find a credential you need, stop and ask; do not search for one.
5. **Do not close issues** unless the owner says so, or says closing is allowed when acceptance criteria are met (that was how #23 was closed). Leave #18 to #22 and #24 to #27 open.
6. **Preserve data**: existing customers, products, billing history and instances. Migrations must be additive. No destructive change to products, servers, prices or deployability. Seeds are idempotent, dry-run first, draft-only.
7. **Do not invent**: no invented legal facts, test results, client compatibility or file paths. Say UNVERIFIED when it is.

## Architecture boundaries
- **One catalogue**: #20 tables (`CatalogFamily`, `CatalogVariant`, `CatalogPreset(Version)`, `CatalogAddonDefinition`) are the single source for Deploy and for post-purchase (#22). Do not add a parallel template or add-on list. Presets are immutable once published; a change is a new version.
- **One DNS engine**: Domains 2.0 (#23): `cloudflare-dns.ts`, `customer-cloudflare.ts`, `dns-approval.ts`, `domain-routing.ts`. Smart Connect (#24) and custom domains go through it. Customer DNS writes are preview, approval, idempotent; own records only; nameservers never touched; managers, viewers and strangers never write the owner's DNS.
- **One resize path**: `upgrades.ts`/`pricing.ts`/`billing.ts` for quotes, credit and quota. Prices are server-side; the browser never decides a price or the plugins of a preset.
- **One game registry**: `GAME_PROFILES` in `game-connect.ts` (keyed by runtime). Compatibility-driven: a game is "supported" only after a real client is shown to work; otherwise it is OFF or experimental.
- **Panel access**: use the services in `api/src/services/panel` and `pterodactyl`; viewer-readable instance routes are whitelisted in `panel/operations.ts`.
- Settings are registered in `setting-registry.ts`; unregistered keys cannot be written.
- Reuse components: `PageEditorShell`, `DataTable`/`CardList` `rowActions`, `ContextMenu`, `useMenuKit`, `QuoteSummary`. Editors are routes with `layout: 'editor'` (see `docs/ai/DECISIONS.md`).

## Design and product standards
- Customer-facing text is plain and honest; no raw infrastructure terms (eggs, nodes, allocations) in the customer app. Do not promise universal support: "hostname without port" works for Minecraft Java and Factorio desktop (SRV), other protocols need a different mechanism or a dedicated IP.
- Keep the existing Blipmade look (tokens in Tailwind config, `docs/TYPOGRAPHY.md`, `docs/design`). Mobile width must work. Empty, loading, error and waiting states are required, not optional.
- Fallback to `IP:port` must always exist when automation cannot help.

## Verification standards
- A feature is done when a test or run **you saw pass** covers its acceptance criteria. Code existing is not done. Report failures with their output; report skipped steps as skipped.
- Distinguish pre-existing failures from regressions by running the same file without your change (see `docs/KNOWN-ISSUES.md`).
- API tests: on VM103 bench only, `set -a; . ~/ci.env; set +a`, one run at a time on the database, never plain `npx vitest` without `ci.env`. Run the files you touched plus their neighbours; the full suite exceeds 25 minutes now, split it.
- Web: `npx tsc --noEmit`, `npm test` (node --test, not vitest), `npm run build`, Playwright with `--workers=4`, sequential batches. The e2e specs use API stubs; a shell needs stubs for `/catalog/products`, `/admin/saved-views`, `/announcements`.
- Real-service claims (Cloudflare, Pterodactyl, Stripe, game clients) need a real run on staging or a disposable node. Use fakes only for logic, and say so.

## Workflow
1. `cd /root/work`; `git status` clean; fetch and rebase on `refs/remotes/github/main`.
2. Make a small change with a test; run it on the bench (rsync `api/src api/prisma api/tests api/scripts` to `~/testbed/api`; run `npx prisma generate` after schema changes).
3. Commit with a precise message. Publish with `bash scripts/publish.sh`. It refuses a dirty tree. The host cannot push to GitHub; the relay can.
4. Comment on the issue with exact results and blockers (a GitHub token with issues:write is needed; ask the owner for one, do not look for one).
5. Deploy only on request (rule 1). Rollback is printed by the script.
6. Do not run `pkill -f <pattern>` where the pattern appears in your own command line. Do not `git archive | tar` an old branch over `/opt/blipmade`; it is a clean checkout that other automation also uses.

## Avoid duplicated work
Before building, read: `docs/AI-HANDOFF.md` section 4, the issue and its comments, `docs/SMART_CONNECT.md`, `docs/CATALOGUE.md`, `docs/DOMAIN_ROUTING.md`, `docs/IMPLEMENTATION-18-23-STATUS.md` (history). Search for the existing service (`api/src/services`) and route (`api/src/routes`) first. Already built and not to be rebuilt: Smart Deploy import (#18 code), Minecraft plugin/world/lag/Geyser tooling, resize quote/credit pipeline, Cloudflare connect and DNS approval, Smart Connect core, readiness gate, preset versions with plugins.
