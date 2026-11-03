# Issues 18–23 status

Updated: 2026-11-03. Production was deployed at `1cfbd58` before this file. Do not deploy again without an explicit request.

## #20 Catalogue

Acceptance: every manifest egg in a family; single-variant families visible; presets install; Discord starters install dependencies; selection survives checkout.

Done before this pass: `draftFamilies` groups all products, `publishReadyFamilies` keeps one-variant families, checkout stores `catalog` on the order item.

This pass: `catalogInstallPlan` writes the chosen preset into the container after the server is online (`applyCatalogInstall`). Discord presets use `npm install && node index.js`. Paper survival merges `server.properties`. CS2, CS 1.6, Rust and Valheim set egg environment. FiveM writes `blipmade-freeroam` and appends `ensure` once. `installationManifest` records installed or failed. Worker retries failures.

Remaining: `publishReadyFamilies` is not run by deploy. Preset install is not proven on a live Pterodactyl server. Not every egg has a gameplay preset; eggs without one stay orderable as themselves.

Next: run the draft sync and publish on a disposable database, then a disposable Discord and Paper server.

## #18 Smart Deploy

Done: inspect, stored import, checkout handoff, container build, health before fulfillment, zip quota.

Remaining: one wizard that does not upload the zip twice; Python and PHP runtimes; MySQL, Postgres and Redis provisioning with injected credentials; project grouping; redeploy and rollback.

Next: extend `GIT_RUNTIMES` and the import plan so a detected Python or PHP project builds inside its container.

## #19 Game panel

Done: Paper plugins, partial Forge, Java player commands, game DNS.

Remaining: Bedrock workspace, Rust, FiveM, CS 1.6, CS2 and Valheim customer workflows beyond the preset environment above. Forge boot proof.

Next: capability-based instance tabs that call the existing panel files and console for each of those slugs, with no shared plugin button.

## #21 Resize

Done: proration, 30-day lock, advisory lock, downgrade credit after the panel accepts the limits, yearly price from the monthly card. Wording on the resize page is marked as a draft.

Remaining: Stripe test-mode charge and webhook, concurrent checkout evidence, disk shrink guard, credit shown on the billing page from the same ledger.

Next: a test that runs two resize checkouts and one Stripe test-mode balance transaction.

## #22 Repurpose and add-ons

Done: backup stream verification, restore and revert, repurpose job states. Profiles save size only.

Remaining: restore a profile onto a server, add-on center discover/installed/updates, live panel restore proof.

Next: profile activation that reapplies the stored installation manifest.

## #23 Domains

Done: preview and approve, record ids, TLS separate from application health, game port TCP check, nameservers and mail DNS left alone.

Remaining: token revocation, Cloudflare for SaaS evaluation only, live test-zone proof.

Next: disconnect deletes only granted record ids and records the result. Do not revoke the token until a disposable zone exists.

## Tests

Unit: `catalog-install.test.ts` covers the preset plans. Full API and web suites passed on `1cfbd58` before this pass. Re-run the unit file and typecheck for this pass before pushing.
