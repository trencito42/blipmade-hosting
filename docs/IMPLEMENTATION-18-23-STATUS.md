# Issues 18–23 status

Updated: 2026-11-03. Production was deployed at `1cfbd58` before this file. Do not deploy again without an explicit request.

## #20 Catalogue

Acceptance: every manifest egg in a family; single-variant families visible; presets install; Discord starters install dependencies; selection survives checkout.

Done before this pass: `draftFamilies` groups all products, `publishReadyFamilies` keeps one-variant families, checkout stores `catalog` on the order item.

`3f5400a`: `catalogInstallPlan` writes the chosen preset into the container after the server is online. Discord presets use `npm install && node index.js`. Paper survival merges `server.properties`. CS2, CS 1.6, Rust and Valheim set egg environment. FiveM writes `blipmade-freeroam` and appends `ensure` once. `installationManifest` records installed or failed. Worker retries failures. Unit test `catalog-install.test.ts` passed. Not proven on a live panel.

This pass: PHP is a manifest product (`php`, egg `php.json`, image `php:8.3-cli`). It is created not deployable until the egg is imported on the panel and an operator marks it deployable. Existing product flags and prices are not changed.

Remaining: `publishReadyFamilies` is not run by deploy. Preset install is not proven on a live Pterodactyl server. Not every egg has a gameplay preset.

Next: import `php.json` on a disposable panel, then order one PHP server.

## #18 Smart Deploy

Done: inspect, stored import, checkout handoff, container build, health before fulfillment, zip quota.

`296c0a3`: Node, Next.js, Vite, FastAPI and Laravel get a build and a start command. Confidence is `likely` when the entry file is assumed. The stored zip is the one used at order time. `GIT_RUNTIMES` includes `python` and `php`. Unit test `import-runtime.test.ts` passed.

`444b228`: a customer can confirm detected PostgreSQL or Redis. The order must include those products. After both are online the worker writes the URL into the app container. MariaDB was not provisioned.

This pass: a quote no longer requires `GIT_ADDRESS`. The egg allows it empty. A stored Git import writes that repository into the egg; a zip or an empty manual order sets `USER_UPLOAD=1` and does not invent a URL. The deploy address keeps `import`, `family`, `variant`, `preset`, `presetVersion` and `addons`. Prisma is not treated as PostgreSQL. A schema with `provider = "mysql"` selects MariaDB. Next.js builds include `npm run build` and `prisma generate` when Prisma is present, and the start command uses `$SERVER_PORT` instead of a port from the repository. Next.js is quoted at 2048 MB when the product allows it. A failed quote blocks the payment step. Unit tests `import-runtime`, `install-variables` and `web/tests/deploy-context.test.ts` passed. daily81 was not fetched live in this run; the fixture matches its package.json, start script and Prisma provider.

Remaining: MariaDB still cannot be auto-provisioned because that egg has no password variable. No disposable deploy of daily81. Go and Rust imports have no start command.

Next: give MariaDB a password the platform can set, then order daily81 against a disposable MySQL server.

## #19 Game panel

Done: Paper plugins, partial Forge, Java player commands, game DNS.

This pass: Bedrock, Rust, FiveM, CS 1.6, CS2 and Valheim have a Game tab. Bedrock and FiveM write their own config file. The others change the egg variables the panel already allows and apply on the next start. None of them shows a plugin installer. `web/tests/game-settings.test.ts` passed. Not proven by clicking through a live server.

Remaining: Forge boot proof, Minecraft world restore, and a disposable panel session for each game.

Next: restore one Bedrock `server.properties` change on a disposable server and confirm the file contents.

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
