# Implementation roadmap

Date 2026-11-05. Order is by risk first, then by dependency. Each step has an acceptance test. Nothing here authorises a production deploy, a price change, a DNS change in production or turning on a flag in production: ask the owner each time.

Why this order: P0 protects money and the release; P1 (#20) defines the catalogue records that #22 and #24 must reuse, so it must settle first; Smart Connect (#24) is already built and only needs proof, so it is cheap to finish before the larger #22; #21 is code complete and waits on the owner.

## P0: security, correctness, release readiness
1. **Rotate disclosed credentials** (owner action, K-01). Then provide a fine-grained GitHub token for issue comments. Acceptance: old Stripe test keys and the classic token are revoked.
2. **Get a clean test baseline.** On the bench run `npm ci`, `npx tsc -p tsconfig.test.json --noEmit`, then the API suite in two halves (so it fits the timeout), logging per file. Classify every failure as pre-existing or regression (K tests table). Acceptance: a written list in `docs/KNOWN-ISSUES.md` where each failing file has a cause; `yearly-term` explained; CI on GitHub read and green or its failures listed.
3. **Re-check production health** after the 2026-11-05 deploy: containers, worker logs, `scripts/smoke-production.sh`. Acceptance: no error loop; `GameConnect` still empty.
4. **Ask the owner** whether Stripe is live and payments enabled (K-02) before any billing work.

## P1: finish #20 Deploy 2.0 (catalogue, presets, Discord bots, checkout)
1. **Review and publish the three draft presets** (`paper-starter`, `paper-protected`, `paper-skyblock`) in the admin preset editor, or edit them. Run `npx tsx scripts/seed-draft-presets.ts` (dry run) then `--apply` against the real DB only when the owner approves. Acceptance: presets visible in the admin as drafts, publishing creates an immutable version, wizard shows the plugin list.
2. **Prove a preset install on a real server** (disposable node or a test instance the owner names): order Paper with `paper-starter`, check `/plugins` has both jars, instance event says restart, manifest `orderInstall.status=installed`. Add a plugin with no build and check `skipped`. Acceptance: recorded result in the #20 issue.
3. **Discord bot family.** Products for discord-bot / nodejs / python / deno exist. Build variants "Node.js" and "Python" in the same family via `admin-catalog-structure.ts` (no new tables), presets Blank, Git repository, ZIP upload, plus the existing moderation/welcome/tickets starters. Extend `catalogInstallPlan` (`catalog-install.ts`) so each preset has a tested file plan and start command. Git/ZIP presets reuse `git-deploy.ts` and the import path of #18; do not write a second importer. Acceptance: unit tests for each plan; a live run of one Node and one Python bot reaching `running`.
4. **Other game modes**: CS2, CS 1.6, Rust, Terraria, FiveM presets. Starter presets exist for some in `ensureStarterPresets`. Each needs egg variable names verified against the real egg (`pterodactyl-eggs/`), a test, and a live proof. Acceptance per game: preset applied and the server starts.
5. **Search and keywords** for presets in the storefront are done for Forge/survival; add the remaining keywords only from real preset names.
6. **Generalise the installer** (K-14) only if a second family needs plugins; key it on the family capability.
Dependencies: none external except a disposable node for steps 2-4.

## P2: finish and verify #24 Smart Connect
1. **Staging**: set `GAME_CONNECT_ENABLED`, `GAME_JOIN_DOMAIN` (a staging subdomain), `GAME_PUBLIC_ADDRESS`, Cloudflare token/zone for a disposable zone on a staging stack. Acceptance: for two Minecraft servers on one public IP, `dig SRV _minecraft._tcp.<label>.<domain>` returns each real allocation port; deleting an instance removes only its own records; running sync twice writes nothing.
2. **Real clients**: Minecraft Java joining without a port; Factorio desktop client via `_factorio._udp`. Record client version and result in `docs/SMART_CONNECT.md`.
3. **FiveM**: only after a real FiveM client is shown to honour `_cfx._udp` (and the TCP side). Until then the profile stays OFF.
4. **Staff switch for `CLIENT_VERIFIED`** and a way to mark a profile verified per game; show "DNS ready" vs "verified with a client" honestly in the card.
5. Optional: AAAA when the node has IPv6.
6. Only then ask the owner whether to turn the flag on in production, per game profile. No dedicated IPv4, NAT or proxy work belongs here.
Dependencies: staging stack, Cloudflare test zone, real clients.

## P3: finish #22 post-purchase features on the #20 catalogue
Rule: use `CatalogFamily/Variant/Preset/AddonDefinition` ids and versions; never a new registry.
1. **Add-on center for Minecraft first**: "Discover / Installed / Updates" for an instance, reading `CatalogAddonDefinition` + compatibility + the instance installation manifest; install via the existing plugin installer, update and uninstall with backup first. Acceptance: tests for compatibility refusal, idempotent install, manifest updated; live proof on a test server.
2. **Profile activation** that reapplies a stored installation manifest (today profiles store size only). Backup first; refuse incompatible variants through `repurpose-gate.ts`.
3. **Add-ons outside Minecraft**: one install recipe per add-on, added only when the recipe is proven.
4. **Live proof of Repurpose** restore/revert on a disposable server.
Dependencies: P1 presets and manifests; disposable node.

## P4: #21 financial verification (owner gated)
1. Owner sign-off on rules and wording; replace the "draft" sentence in `EditResources.tsx` only with approved text.
2. Configure Stripe Tax or document why not; run a VAT test in test mode.
3. Repeat the test-mode run (`docs/` notes in issue #21 comments describe it: test clocks, real Checkout with test card, signed webhooks) against the final build, plus two concurrent resize checkouts.
4. Only then discuss enabling in production. Acceptance: finance/legal written approval linked in #21.

## P5: deferred roadmap (do not forget, do not start without the owner)
- **#25** Cloudflare for SaaS custom hostnames: needs plan/billing decision and a staging account; review hostname allowance and certificate limits first; use real API status fields; tests for issuance, rotation, O2O across accounts.
- **#26** registrar and nameserver guides, optional non-destructive mail DNS automation (MX, SPF, DKIM, DMARC) with the same preview, approval and idempotency.
- **#27** registrar/marketplace integrations, only if real demand.
- **#18** Smart Deploy: finish live proof (daily81), start commands for Go/Rust, MariaDB provisioning; research first.
- **#19** remaining: capability-driven navigation, Advanced mode, adapters for FiveM/Rust/CS, staging acceptance per egg and role.
- Legal launch blockers (`docs/LAUNCH-BLOCKERS.md`), operator actions (`docs/ai/OPERATOR-ACTIONS.md`), egg probes (`scripts/probe-eggs.mjs`).
