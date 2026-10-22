# Verification and operations scripts

Everything in this folder runs on VM 103 (`/opt/blipmade/scripts`).

## Operations

| Script | What it does |
|---|---|
| `backup.sh [label]` | Dumps the database, archives the configuration without secrets, writes a SHA-256 checksum, applies the retention policy and copies the archive to `OFFSITE_TARGET` when one is configured. |
| `restore.sh <archive> [--yes]` | Checks the checksum, lists the dump, asks for confirmation and restores it. |
| `restore-drill.sh [archive]` | Restores the newest archive into a scratch database, compares it with the live one and drops the scratch database. The live database is never written to. |
| `run-tests.sh` | Runs the API test suite against the separate `blipmade_test` database. It refuses to run against a database whose name does not end in `_test`. |
| `inventory.sh` | Prints the products, orders, users, instances, subscriptions, invoices and tickets that are currently stored. |
| `cleanup-panel.py` | Removes the verification servers and accounts from the panel. It never touches the protected server or the existing administrators. `CLEANUP_DRY_RUN=1` shows what it would remove. |
| `cleanup-data.sh` | Removes the rows the verification runs created from the platform database. The administrator account and the demo catalog are kept, and the audit log is not touched. |
| `setup-browser-tools.sh` | Installs Chromium, Xvfb and the Node packages the browser scripts need. |

## Verification

| Script | What it does |
|---|---|
| `verify-provisioning.py <base-url> <internal-token> <admin-email> <admin-password>` | Creates a product, a customer and an order, pays it through the local test gateway and waits for the worker to provision a real server. |
| `probe-pterodactyl.py` | Reads the Application API contract of the panel. |
| `probe-schema.py` | Makes the panel's own validator list the fields each server route expects. |
| `probe-list-panel.py` | Lists the servers and accounts on the panel. |
| `probe-node.py` | Reads the node and server state with GET requests only. |
| `probe-allocation.py` | Shows the allocation of a server and probes every address the port could be on. |
| `probe-binding.py` | Creates a server, waits for the install and checks whether the host port opens. |
| `probe-startup.py` | Changes the startup command of a test server and watches the daemon. |
| `probe-limits.py` | Changes the limits of a test server and watches the daemon. |
| `client-read.py` | Reads the runtime details of a server through the Client API. |
| `watch-install.py` | Watches the install progress of a server. |

## Browser scripts

The panel protects its login with an invisible reCAPTCHA and the responsive
screenshots have to look like a real browser, so these drive Chromium through
Playwright. Run them under Xvfb:

```bash
xvfb-run -a node scripts/browser-session.mjs      # log into the panel, save the session
xvfb-run -a node scripts/browser-state.mjs       # read the container state
xvfb-run -a node scripts/browser-console.mjs     # capture the console output
node scripts/console-stream.mjs                  # same, reusing the saved session
xvfb-run -a node scripts/browser-screenshots.mjs # capture the interface at 390 px and 1440 px
```

`browser-screenshots.mjs` reads `BM_EMAIL` and `BM_PASSWORD` to sign in, so the
screenshots show real data instead of empty states.
