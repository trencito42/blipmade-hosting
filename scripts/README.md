# Verification and operations scripts

Everything in this folder runs on VM 103 (`/opt/blipmade/scripts`).

## How the folder is organised

| Folder | What belongs there |
|---|---|
| `scripts/` | The operator runbooks: backups, restores, the inventory, the tests and the two cleanup tools. They are run by hand, they print what they are about to change and they need an explicit flag before anything is changed. |
| `scripts/ops/` | The exploration and debugging tools: the panel probes, the browser drivers and the client readers. They are used to find out what the panel does. Everything that changes something needs `--execute`. |

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
| `backup.sh [label]` | Dumps the database, archives the configuration without secrets, writes a SHA-256 checksum, applies the retention policy and copies the archive to `OFFSITE_TARGET` when one is configured. | Writes files in `BACKUP_DIR`. | `OFFSITE_TARGET` (optional). | Read the summary it prints at the end. |
| `restore.sh <archive> [--yes]` | Checks the checksum, lists the dump, asks for confirmation and restores it. | Yes, it overwrites the database. | the archive path. | It asks before it writes; `--yes` skips the question. |
| `restore-drill.sh [archive]` | Restores the newest archive into a scratch database, compares it with the live one and drops the scratch database. | No, the live database is never written to. | the archive path. | Safe to run at any time. |
| `run-tests.sh` | Runs the API test suite against the separate `blipmade_test` database. | Only the test database. | the test database name. | It refuses to run against a database whose name does not end in `_test`. |
| `inventory.sh` | Prints the products, orders, users, instances, subscriptions, invoices and tickets that are currently stored. | No. | – | Safe to run at any time. |
| `setup-browser-tools.sh` | Installs Chromium, Xvfb and the Node packages the browser scripts need. | Installs packages into `tools/`. | – | Run it once on a new host. |
| `cleanup-panel.py` | Removes the verification servers and accounts from the Pterodactyl panel. | Yes, it deletes panel objects. | `PTERODACTYL_URL`, `PTERODACTYL_APP_KEY`, `CLEANUP_DRY_RUN=0` and `--confirm` for a real run. | It only prints its plan by default. See below. |
| `cleanup-data.sh` | Removes the rows the verification runs created from the platform database. | Yes, it deletes database rows. | Docker Compose and the postgres service. | It only prints its plan by default. See below. |
| `verify-provisioning.py` | Creates a product, a customer and an order, pays it through the local test gateway and waits for the worker to provision a real server. | Yes, it creates rows and a real panel server. | `BM_ADMIN_EMAIL`, `BM_ADMIN_PASSWORD`, `BM_INTERNAL_TOKEN`, optionally `BM_BASE_URL`. | It only prints its plan by default; `--execute` runs it. |

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
| `watch-install.py` | Watches the install progress of a server. | No. | `PTERODACTYL_APP_KEY`, optional `PROBE_SERVER_ID`, `PROBE_HOST`, `PROBE_PORT` |
| `browser-session.mjs` | Logs into the panel and stores the session cookies. | Writes a local session file (mode 0600). | `PANEL_EMAIL`, `PANEL_PASSWORD`, optional `COOKIE_OUT` |
| `browser-state.mjs` | Reads the container state of a server through the Client API. | No. | `PANEL_EMAIL`, `PANEL_PASSWORD`, `PROBE_SERVER_UUID` |
| `browser-console.mjs` | Captures the console output of a server. | No. | `PANEL_EMAIL`, `PANEL_PASSWORD`, `PROBE_SERVER_UUID` |
| `console-stream.mjs` | The same, reusing the saved session. | No. | `COOKIE_FILE`, `PROBE_SERVER_UUID` |
| `browser-screenshots.mjs` | Captures the interface at 390 px and 1440 px. | No, it only writes images. | optional `BM_EMAIL`, `BM_PASSWORD`, `BM_BASE`, `SHOT_DIR` |
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
