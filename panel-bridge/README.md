# The panel bridge of Blipmade

The small component that lets the Blipmade backend obtain a **client API key for one customer**
from the Pterodactyl panel, without a browser and without the backend ever holding an
administrative key for customer operations.

It is installed **into the panel** (Pterodactyl 1.x, host VM 100) and it is the only way to get a
credential that is scoped to one customer: the panel has no route that creates a token, and the
client API refuses an application key with `403`.

The operator-facing document, with the full contract and the troubleshooting table, is
[`docs/PANEL_BRIDGE.md`](../docs/PANEL_BRIDGE.md).

---

## What is in here

| file | what it is |
|---|---|
| `BlipmadeKeyMintController.php` | the controller. It goes to `app/Http/Controllers/` of the panel. |
| `config/blipmade_bridge.php` | the configuration. It goes to `config/` of the panel. |
| `routes-snippet.php` | the route. It is appended to `routes/api.php` of the panel. |
| `install.sh` | the installer. It runs on the panel host as root. |

## The contract in one paragraph

`POST` with the JSON body `{ external_id, timestamp, nonce, signature }`. The signature is
HMAC-SHA256 over `timestamp . '.' . nonce . '.' . external_id`, keyed with the secret of
`BLIPMADE_KEYMINT_SECRET`, in hex. The answer is `{"token": "ptlc_…"}`; the errors are
`disabled` (503), `invalid_request` (400), `unauthorized` (401), `replayed` (401) and
`not_found` (404).

## The installation

On the panel host, as root:

```bash
cd panel-bridge
./install.sh /var/www/pterodactyl 203.0.113.10
```

The first argument is the panel directory (default `/var/www/pterodactyl`, also read from
`PANEL_DIR`), the second is the public address of the Blipmade server, which goes into the list
of allowed addresses of the panel.

The script copies the two files, appends the route to `routes/api.php` **only when it is not
there yet**, adds `BLIPMADE_KEYMINT_SECRET` and `BLIPMADE_KEYMINT_ALLOWED_IPS` to the `.env` of
the panel **only when they are missing**, runs `php artisan optimize:clear` and prints the
secret and the list of allowed addresses.

It is idempotent: run it again and nothing is added, an existing secret is never overwritten and
no file is ever deleted.

The two lines that the installer prints go into the `.env` of Blipmade
(`/opt/blipmade/.env` on the control plane host):

```
PANEL_KEYMINT_URL=https://<the host of the panel>/api/blipmade/keymint
PANEL_KEYMINT_SECRET=<the secret that the installer printed>
```

Then the API and the worker are restarted, they read the `.env` when they start.

## The removal

1. Remove the block that starts with `// Blipmade panel bridge` from `routes/api.php`:

   ```bash
   sed -i '/\/\/ Blipmade panel bridge/,/api\.blipmade\.keymint/d' /var/www/pterodactyl/routes/api.php
   ```
2. Delete `app/Http/Controllers/BlipmadeKeyMintController.php` and
   `config/blipmade_bridge.php`.
3. Run `php artisan optimize:clear`.
4. Remove `PANEL_KEYMINT_URL` and `PANEL_KEYMINT_SECRET` from the `.env` of Blipmade and restart
   the API and the worker.

The keys that were handed out stay valid until they are revoked on the panel.

## The test from the Blipmade side

The backend asks the bridge for a key when it does not have one for the customer yet. The same
call by hand, with Node:

```js
import { createHmac, randomBytes } from 'node:crypto';

const timestamp = Math.floor(Date.now() / 1000).toString();
const nonce = randomBytes(16).toString('base64url');
const signature = createHmac('sha256', secret).update(`${timestamp}.${nonce}.${externalId}`).digest('hex');

const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ external_id: externalId, timestamp, nonce, signature }),
});

console.log(response.status, await response.text());
```

A working bridge answers `200` and a body that carries a key starting with `ptlc_`. The full
example, with the shell version and the troubleshooting table, is in
[`docs/PANEL_BRIDGE.md`](../docs/PANEL_BRIDGE.md).
