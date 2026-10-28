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
| `tools/blipmade-create-key.php` | makes an Application API key, through the service of the panel. For a panel that has no administrative key any more. |
| `tools/blipmade-import-egg.php` | imports an egg, through the service of the panel. For an egg that is not in the panel yet. |

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

---

## When the panel has no key and no egg

Two things can be missing from a panel that is otherwise alive, and both were
measured on the panel of Blipmade on the 27th of October 2026.

**The Application API key is gone.** The key of the platform lives in the table
`api_keys`, and the keys of a user go away with the user: when the account that
made the key is deleted, the key is deleted with it and cannot be recovered.
The panel then answers `401 Unauthenticated` to every call, and the platform
cannot create a service any more. A new key is made with the tool of the
panel, through the service of the panel, and it is passed to the platform
through the standard input:

```bash
# on the panel host, as root
cd /var/www/pterodactyl && php /root/blipmade-panel-tools/blipmade-create-key.php

# from the machine that holds the platform
ssh panel 'cat /root/panel-key.txt' | ssh platform 'cd /opt/blipmade && ./scripts/apply-panel-key.sh'
```

The key is accepted only from the address of the platform (`allowed_ips`), and
it may create servers and customer accounts, and read the nodes, the nests, the
eggs and the locations. It may not change the eggs or the nodes.

**The eggs are not in the panel.** The import of an egg is a route of the panel
that needs a session of an administrator, so it cannot be done with the
Application API. The service of the panel can be called directly, which is
what the tool of the panel does:

```bash
# on the panel host, as root
cd /var/www/pterodactyl && php /root/blipmade-panel-tools/blipmade-import-egg.php /tmp/postgres16.json 5
```

The files of the eggs are in [`pterodactyl-eggs/`](../pterodactyl-eggs/) and the
guide is in [`pterodactyl-eggs/README.md`](../pterodactyl-eggs/README.md). The
nest of the products of Blipmade is "Discord Bots", which is the nest 5 in this
panel.
