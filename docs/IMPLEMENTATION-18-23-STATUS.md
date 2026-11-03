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

Preset install no longer records `installed` when the files are written. The manifest goes to `verifying`, the server is restarted, and `installed` is recorded only when the process state is `running`. Five failed observations stop at `gave_up`. The retry query skips `installed`, `none` and `gave_up`. An order with a preset stays unfulfilled until that check passes. `catalog-install.test.ts` covers the outcome. Not proven on a live panel.

`2ac7be9` made `GIT_ADDRESS` optional for Node.js, kept import query parameters, and stopped treating Prisma as PostgreSQL. `90a37ef` waits for a running process before a preset is installed and skips finished installs in the retry scan.

This pass: `/catalog/quote` accepts `importSourceId` and adds the confirmed database lines. The application build does not start until `linkImportDependencies` has written the database URL. `appliedAt` is no longer required before that link, so a health check cannot run before the credentials exist. `manifestUrls` fetches `prisma/schema.prisma`. Unit tests: `import-runtime` (daily81 fixture and schema URL), `install-variables`, `project-links` (build waits, quote adds the database), `catalog-install`, `web/tests/deploy-context.test.ts`. API and web typechecks passed.

Live fetch of `https://github.com/trencito42/daily81` on this machine returned Node.js, MariaDB confirmed (`provider = "mysql"`, not the Prisma generator), build `npm install && npx prisma generate && npm run build`, start `next start -p $SERVER_PORT -H 0.0.0.0`, recommended RAM 2048. The first `provider` in that schema is `prisma-client-js`; the database provider is read only when it is mysql, postgresql, or sqlite. Credentials are written only after the database port accepts a TCP connection, and the application is not restarted before its build. Preset retries select only `verifying`, `failed`, and `installing`, oldest update first.

This pass: MariaDB is a confirmed dependency the customer can add to the order. The egg still has no password variable, so the platform stores one password per database and does not send that name to the panel. After the allocation accepts a TCP connection, the MariaDB client is asked to create database `blipmade` and user `blipmade` from a file, and the file is then deleted. The application receives `mysql://blipmade:<password>@<allocation>/blipmade`. The console command does not contain the password. The import review shows the build command, the start command, the recommended memory, and environment names from examples. `secretsForEgg` keeps a generated password out of an egg that does not declare it.

Not done: this host has no Docker and no disposable Pterodactyl node, so the grant was not executed against MariaDB and daily81 was not built. The MariaDB client must be the foreground process (`${MARIADB_EXECUTABLE}`) for `source` to run. Redis still listens on its allocation and requires its password. Do not call the customer order proven.

Next: on a disposable node, order daily81 with MariaDB, read back that `blipmade` can authenticate, then build and open the allocated port.

## #19 Game panel

Done: Paper plugins, partial Forge, Java player commands, game DNS.

This pass: Bedrock, Rust, FiveM, CS 1.6, CS2 and Valheim have a Game tab. Bedrock and FiveM write their own config file. The others change the egg variables the panel already allows and apply on the next start. None of them shows a plugin installer. `web/tests/game-settings.test.ts` passed. Not proven by clicking through a live server.

Remaining: Forge boot proof, Minecraft world restore, and a disposable panel session for each game.

Next: restore one Bedrock `server.properties` change on a disposable server and confirm the file contents.

## #21 Resize

Done: proration, 30-day lock, advisory lock, downgrade credit after the panel accepts the limits, yearly price from the monthly card. Wording on the resize page is marked as a draft.

This pass: a smaller disk is refused when usage is unknown or the stored files plus 64 MB do not fit. The check runs on the quote and again before the panel limits change. `disk-shrink.test.ts` passed. `upgrades.test.ts` passed on the disposable CI database, including a shrink that fits and a shrink that does not.

Remaining: Stripe test-mode charge and webhook, concurrent checkout evidence, credit shown on the billing page from the same ledger.

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
