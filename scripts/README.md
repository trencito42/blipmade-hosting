# Verification and operations scripts

Everything in this folder runs on VM 103 (`/opt/blipmade/scripts`).

## How the folder is organised

| Folder | What belongs there |
|---|---|
| `scripts/` | The operator runbooks: backups, restores, the inventory, the tests and the two cleanup tools. They are run by hand, they print what they are about to change and they need an explicit flag before anything is changed. |
| `scripts/ops/` | The exploration and debugging tools: the panel probes, the browser drivers and the client readers. They are used to find out what the panel does. Everything that changes something needs `--execute`. |
| `scripts/edge/` | The tools of the edge (VM 102), where Caddy answers the visitors. **They run on the edge and not on the platform**: the platform writes its routes into Caddy through the administrative API and never touches the files of the edge. |

Two rules hold for every script in this folder:

* **No credential is stored here.** Every secret comes from the environment
  and the script stops with a clear message when it is missing. The panel
  password is never printed, never logged and never written to a file.
* **TLS verification is never switched off.** When a certificate is not
  trusted the script says how to install the CA certificate instead of
  trusting it.

## Operator runbooks

| Script | What it does | Changes something? | Needs | How to run it safely |
|---|---|---|---|---|
| `backup.sh [label]` | Dumps the database, archives the configuration without secrets, writes a SHA-256 checksum and applies the retention policy. The encrypted copy that leaves the host is a separate step: `backup-offsite.sh`. | Writes files in `BACKUP_DIR`. | nothing. | Read the summary it prints at the end. |
| `backup-offsite.sh` | Makes the encrypted copy that leaves the host, reads it back to prove it is whole, sends it to the target and only then releases the local copy. | Writes files in `BACKUP_DIR/offsite` and on the target. | `OFFSITE_TARGET`, and `OFFSITE_AGE_RECIPIENT` + `OFFSITE_AGE_IDENTITY` (or `OFFSITE_ENCRYPTION_KEY` as a fallback). | It fails loudly and keeps the local copy when the copy cannot be made. |
| `backup-alert.sh [reason]` | Sends the alarm of a failed backup by webhook or by mail, and writes it to the journal of the machine when neither is configured. | No. | `BACKUP_ALERT_WEBHOOK_URL` or `SMTP_URL` (with `SMTP_CA_FILE` when the relay has its own certificate). | It never fails itself: a missing webhook must not turn a failed backup into a failed alarm. systemd starts it through `blipmade-backup-alert.service` when the backup fails. |
| `restore.sh <archive> [--yes]` | Checks the checksum, lists the dump, asks for confirmation and restores it. | Yes, it overwrites the database. | the archive path. | It asks before it writes; `--yes` skips the question. |
| `restore-drill.sh [archive]` | Restores the newest archive into a scratch database, compares it with the live one and drops the scratch database. | No, the live database is never written to. | the archive path. | Safe to run at any time. |
| `run-tests.sh` | Runs the API test suite against the separate `blipmade_test` database. | Only the test database. | the test database name. | It refuses to run against a database whose name does not end in `_test`. |
| `run-e2e.sh` | Builds the site and runs the browser tests of it: the account, the plans, the catalogue, the documentation, the menu of a phone, and axe on the five public pages. | No. | the Chromium of Playwright (`npx playwright install chromium`). | The answers of the account are stubbed in the tests, so no account is created in the live database. |
| `inventory.sh` | Prints the products, orders, users, instances, subscriptions, invoices and tickets that are currently stored. | No. | – | Safe to run at any time. |
| `setup-browser-tools.sh` | Installs Chromium, Xvfb and the Node packages the browser scripts need. | Installs packages into `tools/`. | – | Run it once on a new host. |
| `cleanup-panel.py` | Removes the verification servers and accounts from the Pterodactyl panel. | Yes, it deletes panel objects. | `PTERODACTYL_URL`, `PTERODACTYL_APP_KEY`, `CLEANUP_DRY_RUN=0` and `--confirm` for a real run. | It only prints its plan by default. See below. |
| `cleanup-data.sh` | Removes the rows the verification runs created from the platform database. | Yes, it deletes database rows. | Docker Compose and the postgres service. | It only prints its plan by default. See below. |
| `verify-provisioning.py` | Creates a product, a customer and an order, pays it through the local test gateway and waits for the worker to provision a real server. | Yes, it creates rows and a real panel server. | `BM_ADMIN_EMAIL`, `BM_ADMIN_PASSWORD`, `BM_INTERNAL_TOKEN`, optionally `BM_BASE_URL`. | It only prints its plan by default; `--execute` runs it. |
| `import-catalogue.sh` | Writes the catalogue of the eggs (`pterodactyl-eggs/manifest.json`) into the database: 66 products with their resources, their egg and the values the customer fills at the order. It is idempotent and it does not touch the flag that opens a product for ordering. | Yes, it writes the products of the catalogue. | `ALLOW_PRODUCTION_SEED=true` and the database of the platform. | It refuses the live database without the flag, and it refuses any other database. See [`docs/CATALOGUE.md`](../docs/CATALOGUE.md). |
| `set-rate-card.sh` | Writes the rate card of the platform into the settings: the cents of a gigabyte of memory, of a processor, of a gigabyte of disk and of the fee of the instance. The card is written in the settings and in every row of a server. The prices the customers already have are not touched. | Yes, it writes the card of the platform. | `ALLOW_PRODUCTION_SEED=true` and the database of the platform. | It refuses the live database without the flag, and it refuses any other database. See [`docs/PRICING.md`](../docs/PRICING.md). |

## The systemd units of the backup

```bash
sudo scripts/install-backup-timer.sh            # install the units and the schedule
sudo scripts/install-backup-timer.sh --run-now  # and run the backup once
```

| Unit | What it does |
|---|---|
| `blipmade-backup.service` | Runs the local backup and then the encrypted copy that leaves the host. It asks for the alarm in its `OnFailure`, in the section `Unit` of systemd: in the section `Service` the key is read as unknown and ignored, so the alarm of a failed backup would never be sent. |
| `blipmade-backup-alert.service` | The alarm itself. It reads the environment of the platform, so the mail leaves by the same relay as the rest of the mail of the platform. |
| `blipmade-backup.timer` | Runs the backup every night at 02:15, with a random delay of up to fifteen minutes, and runs it after a reboot that happened during that hour. |

The installer is idempotent: it installs the units, reloads systemd, refuses to
finish when systemd did not accept a unit (`systemd-analyze verify`), refuses to
finish when the alarm is not wired (`OnFailure` is empty), and then enables the
timer.

## The cleanup tools

### `cleanup-panel.py`

```bash
scripts/cleanup-panel.py                                  # plan only, nothing is read and nothing is changed
scripts/cleanup-panel.py --list                           # read-only listing of the panel and the allowlist
CLEANUP_DRY_RUN=0 scripts/cleanup-panel.py --execute \
    --confirm CLEANUP-PANEL-<count>                       # the only way to delete
```

Safety rules:

1. **Dry run by default.** The script prints the plan and changes nothing.
2. **Three independent signals are needed for a delete:** `CLEANUP_DRY_RUN=0`
   in the environment, `--execute` on the command line and a `--confirm`
   token. The token is either `CLEANUP-PANEL-<count>` with the number of
   verified targets or `yes-i-audited-the-targets`. `CLEANUP_DRY_RUN=1`
   forces a dry run, and the old name of the variable keeps working.
3. **Without `--confirm` the script refuses before it sends a single
   request**, so a mistyped `--execute` cannot reach the panel.
4. **Only the ids in `ALLOWED_SERVERS` / `ALLOWED_USERS` can be deleted.**
   A target has to report the exact id, uuid and name that the allowlist
   records; anything else is reported and kept.
5. **The protected server is refused** (`id 2`, uuid
   `aec52a41-0445-4c03-bab9-82f1af8ed621`, name `Blipmade App Test`) even
   if it appears in the allowlist, and so are the existing administrators
   (user ids 1-4).
6. **A delete is only ever sent to a URL that was built from an allowlisted
   id.** There is no wildcard delete.
7. The API key is only ever sent as a request header and is never printed.

The allowlist tables live at the top of the script. To add a target: run
`--list`, read the id, uuid and name of the object you audited, paste the
triple into the table and only then run the script with `--execute`.

### `cleanup-data.sh`

```bash
scripts/cleanup-data.sh                                   # plan only, nothing is changed
scripts/cleanup-data.sh --execute --confirm DELETE-<count> # the only way to delete
```

The plan lists every row that would be removed. The delete runs in one
transaction, so a foreign key problem rolls the whole thing back and the
database is never left half cleaned. The administrator account, the demo
catalog and the append-only audit log are never touched.

## Ops and debugging tools (`scripts/ops/`)

These tools explore the panel. Everything that changes something needs
`--execute` and prints its plan first.

| Script | What it does | Changes something? | Needs |
|---|---|---|---|
| `probe-list-panel.py` | Lists the servers and accounts on the panel. | No. | `PTERODACTYL_APP_KEY` |
| `probe-node.py` | Reads the node and the server state with GET requests only. | No. | `PTERODACTYL_APP_KEY` |
| `probe-allocation.py` | Shows the allocation of a server and probes every address the port could be on. | No. | `PTERODACTYL_APP_KEY`, optional `PROBE_ALLOCATIONS` |
| `probe-schema.py` | Makes the panel's own validator list the fields each server route expects. | The reinstall probe can reinstall the server, so `--execute` is required. | `PTERODACTYL_APP_KEY`, optional `PROBE_SERVER_ID` |
| `probe-pterodactyl.py` | Rebuilds a test server with different images and reports what the panel answers. | Yes, `--execute` is required. | `PTERODACTYL_APP_KEY` |
| `probe-binding.py` | Creates a server, waits for the install and checks whether the host port opens. | Yes, it creates a server, `--execute` is required. | `PTERODACTYL_APP_KEY`, `COOKIE_FILE`, optional `PROBE_ALLOCATION`, `PROBE_USER`, `PROBE_EGG` |
| `probe-startup.py` | Changes the startup command of a test server and watches the daemon. | Yes, `--execute` is required. | `PTERODACTYL_APP_KEY`, `COOKIE_FILE`, optional `PROBE_SERVER_ID`, `PROBE_SERVER_UUID` |
| `probe-limits.py` | Changes the limits of a test server and watches the daemon. | Yes, `--execute` is required. | `PTERODACTYL_APP_KEY`, `COOKIE_FILE`, optional `PROBE_SERVER_ID`, `PROBE_SERVER_UUID` |
| `probe-ui-calls.py` | Lists every HTTP call the panel interface makes. | No. | – |
| `probe-ui-create.py` | Finds the API calls the panel interface uses to create a server. | No. | – |
| `client-read.py` | Reads the runtime details of a server through the Client API. | No. | `COOKIE_FILE`, `PROBE_SERVER_UUID` |
| `repair-starter-port.mjs` | Reads the application of every container of the platform, compares it with the application the platform writes and corrects the line of the port of the files that are the application of the platform. The code of a customer is reported and left exactly as it is. | Yes, it writes the corrected files, so `--execute` is required. | The configuration of the platform (`.env`), the database and the panel. | It prints the plan and changes nothing without `--execute`. |
| `provision-test-instance.mjs` | Provisions a real instance on the real panel, reads the application that is really in its container, asks the port the node publishes over HTTP and points a hostname of the edge at it over HTTPS before putting it back. | Yes, it creates a real server and a real order, so `--execute` is required. `--cleanup` removes them again. | The configuration of the platform (`.env`), the database, the panel and the edge. | It prints the plan and creates nothing without `--execute`. |
| `watch-install.py` | Watches the install progress of a server. | No. | `PTERODACTYL_APP_KEY`, optional `PROBE_SERVER_ID`, `PROBE_HOST`, `PROBE_PORT` |
| `browser-session.mjs` | Logs into the panel and stores the session cookies. | Writes a local session file (mode 0600). | `PANEL_EMAIL`, `PANEL_PASSWORD`, optional `COOKIE_OUT` |
| `browser-state.mjs` | Reads the container state of a server through the Client API. | No. | `PANEL_EMAIL`, `PANEL_PASSWORD`, `PROBE_SERVER_UUID` |
| `browser-console.mjs` | Captures the console output of a server. | No. | `PANEL_EMAIL`, `PANEL_PASSWORD`, `PROBE_SERVER_UUID` |
| `console-stream.mjs` | The same, reusing the saved session. | No. | `COOKIE_FILE`, `PROBE_SERVER_UUID` |
| `browser-screenshots.mjs` | Captures the interface at 390 px and 1440 px, with a session for the customer pages and another for the staff pages. | No, it only writes images. | optional `BM_EMAIL`, `BM_PASSWORD`, `BM_ADMIN_EMAIL`, `BM_ADMIN_PASSWORD`, `BM_BASE`, `SHOT_DIR` |
| `browser-responsive.mjs` | Checks every route at 320, 375, 390, 768, 1024 and 1440 px: sideways scroll, elements out of the viewport, clipped text, the size of the tap targets of the bottom bar and the errors of the console. | No, it only writes a report. | optional `BM_EMAIL`, `BM_PASSWORD`, `BM_BASE`, `SHOT_DIR`, `BM_SHOTS` |
| `browser-instance-tabs.mjs` | Walks the ten tabs of the page of an instance in a real browser, at 390 px and 1440 px: the sideways scroll, the clipped text and the errors of the console. The 503 of the panel is told apart, because it is the honest state while the key bridge of the panel is not installed. | No, it only writes a report and images. | optional `BM_EMAIL`, `BM_PASSWORD`, `BM_BASE`, `BM_INSTANCE_PATH`, `SHOT_DIR` |
| `browser-checks.mjs` | Checks the behaviour that was fixed: one focus indicator, the autofill of the browser, the password button, the order of the keyboard, the links and the deploy buttons against the catalog. | No. | optional `BM_EMAIL`, `BM_PASSWORD`, `BM_BASE` |
| `verify-frontend.sh` | Runs the three passes above in one go. It signs in as few times as possible, because the login endpoint allows ten attempts every fifteen minutes for an address. | No. | `BM_EMAIL`, `BM_PASSWORD`, `BM_ADMIN_EMAIL`, `BM_ADMIN_PASSWORD`, optional `BM_BASE`, `SHOT_DIR` |
| `seed-browser-account.mjs` | Creates the two accounts that the browser checks sign in with. The password is never stored in the repository. | Writes two accounts in the database. | optional `BM_PASSWORD`, `BM_CLEANUP` |
| `browser-scrollbar.mjs` | Checks that the custom scrollbar is applied and captures it. | No, it only writes images. | optional `BM_BASE`, `SHOT_DIR` |
| `browser-scrollbar-hover.mjs` | Captures the scrollbar in its resting and hovered state. | No, it only writes images. | optional `BM_BASE`, `SHOT_DIR` |

The panel protects its login with an invisible reCAPTCHA and the responsive
screenshots have to look like a real browser, so these drive Chromium through
Playwright. Run them under Xvfb:

```bash
xvfb-run -a node scripts/ops/browser-session.mjs      # log into the panel, save the session
xvfb-run -a node scripts/ops/browser-state.mjs        # read the container state
xvfb-run -a node scripts/ops/browser-console.mjs      # capture the console output
node scripts/ops/console-stream.mjs                   # same, reusing the saved session
xvfb-run -a node scripts/ops/browser-screenshots.mjs  # capture the interface
```

The browser tools need `playwright-core` and `ws`. They live in `tools/`,
which is gitignored; `scripts/setup-browser-tools.sh` installs them.

## TLS

The scripts never set `rejectUnauthorized: false`. When the panel's
certificate is not trusted by the machine the script stops with a message
that names the cause. Install the CA certificate and point Node at it:

```bash
SSL_CERT_FILE=/etc/ssl/certs/blipmade-ca.pem node scripts/ops/console-stream.mjs
# or
export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/blipmade-ca.pem
```

### `edge/apply-origin-cert.py`

This one runs on the **edge** (`10.77.0.12`), as root, and not on the
platform. It puts the certificate of the origin in place — the one that
Cloudflare trusts between itself and the edge — and proves that the edge
serves it.

```bash
# on the edge, as root
cat certificate.pem key.pem | sudo python3 apply-origin-cert.py
```

The copy that is on the edge is installed at `/usr/local/sbin/apply-origin-cert.py`,
so it survives a restart of the machine; the copy of the repository is the one
that is read when the edge is built again.

The certificate and the key are read from the standard input, so the private
key never appears in the list of the processes and never in the history of a
shell. The script refuses a certificate that cannot be read, a key that
cannot be read, a pair whose two halves do not belong together, a certificate
that expires within a week, and a certificate that does not cover the
wildcard of the base of the platform. It keeps a copy of the certificate that
was in use, writes the new one with the rights of the service of Caddy, puts
the routes of the customers back after the reload of Caddy — a reload
replaces the whole configuration, and the routes that were written through the
administrative API are not a part of the file — and then checks the handshake
with the name of the wildcard.

The whole story of the certificates is in `docs/DOMAIN_ROUTING.md`.
