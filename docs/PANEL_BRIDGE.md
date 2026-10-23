# Blipmade — the panel bridge

The bridge is the small endpoint that the Pterodactyl panel carries so that Blipmade can get a
**client API key for one customer**, without a browser and without holding an administrative key
for customer operations.

It lives in `panel-bridge/` of this repository and is installed into the panel itself.

---

## Why it exists

The panel is administered with an **application key** (`ptla_…`). That key can do everything,
including the work of a customer: files, power, console, backups, databases, schedules. The
Blipmade backend does not use it for that work, because a key that can do everything is not
scoped to one customer, and a customer operation must never be able to touch another account.

The **client key** (`ptlc_…`) of a customer is scoped to the panel account of that customer. It is
what the backend needs. But the panel cannot hand one out over its own HTTP API:

| what was tried on the panel | what happens |
|---|---|
| `POST /api/application/users/{id}/token` | the route does not exist |
| `POST /api/client/account/api-tokens` | the route does not exist |
| `POST /api/client/auth/login` | the route does not exist |
| the client API with the application key | `403` — *"You are attempting to use an application API key on an endpoint that requires a client API key"* |

Only code that runs **inside** the panel (Laravel) can create a client key. The bridge is that
code: one route, signed with a secret that only Blipmade and the panel know. It is therefore the
only way to obtain a credential that is scoped to one customer, and it is the reason the customer
area (console, files, power, databases, schedules) works at all.

The bridge issues the key, the backend stores it encrypted per customer, and the key is revoked
and replaced as soon as a new one is asked for. At most one live key exists per account.

---

## The contract

Both sides speak the same small JSON over HTTP.

**Request** — `POST` to the URL of the bridge, with `Content-Type: application/json`:

```json
{
  "external_id": "blipmade_acc_<the id of the customer>",
  "timestamp": "1761200000",
  "nonce": "u0N9VvE2c3Zl6YtQkA1bA",
  "signature": "<64 characters of hex>"
}
```

| field | shape | meaning |
|---|---|---|
| `external_id` | `^blipmade_acc_[A-Za-z0-9_-]{1,64}$` | the panel account of the customer. It is set when Blipmade creates the account, and it is the **only** thing the panel looks the account up by. |
| `timestamp` | digits only | the seconds since the epoch, on the clock of the caller. The panel refuses it when it is more than 60 seconds away from its own clock. |
| `nonce` | `[A-Za-z0-9_-]{16,64}` | a value that is used once. The panel remembers it for 120 seconds and refuses a second request with the same nonce. |
| `signature` | 64 characters of hex | HMAC-SHA256 over `timestamp . '.' . nonce . '.' . external_id`, keyed with the shared secret. |

**The signature** is the same construction on both sides, character for character:

```php
// the panel (BlipmadeKeyMintController.php)
hash_hmac('sha256', $timestamp . '.' . $nonce . '.' . $externalId, $secret)
```

```js
// Blipmade (node:crypto)
createHmac('sha256', secret).update(`${timestamp}.${nonce}.${externalId}`).digest('hex')
```

**Answer** — `200` with the key:

```json
{ "token": "ptlc_0123456789abcdef0123456789abcdef0123456789abcd" }
```

The key is the identifier of the token plus its secret, exactly like every other client key of the
panel: the identifier is sixteen characters and starts with `ptlc_`, the secret is thirty-two, so a
whole key is forty-eight characters long. The backend stores it encrypted and never shows it in the
browser.

**Errors** — a short code in the body, and the status code beside it:

| code | status | what it means |
|---|---|---|
| `disabled` | `503` | the secret is missing or shorter than 32 characters, or the list of allowed addresses is empty. The bridge is switched off. |
| `invalid_request` | `400` | a field is missing or does not have the expected shape. |
| `unauthorized` | `401` | the signature does not match, or the timestamp lies outside the window of 60 seconds. |
| `replayed` | `401` | the nonce was already used. |
| `not_found` | `404` | no panel account carries that `external_id`, or the account is a root administrator. |

---

## The variables of the environment

**On the panel** (`/var/www/pterodactyl/.env`):

| variable | meaning |
|---|---|
| `BLIPMADE_KEYMINT_SECRET` | the secret both sides sign with. At least 32 characters. The bridge answers `503` when it is missing or too short. |
| `BLIPMADE_KEYMINT_ALLOWED_IPS` | the addresses a client key may be used from, separated by commas. This is the public address of the Blipmade server. The bridge answers `503` when the list is empty. |

**On Blipmade** (`/opt/blipmade/.env` on the control plane host):

| variable | meaning |
|---|---|
| `PANEL_KEYMINT_URL` | the full address of the bridge, for example `https://panel.example.net/api/blipmade/keymint`. |
| `PANEL_KEYMINT_SECRET` | the same secret as on the panel. |

`PTERODACTYL_URL` and `PTERODACTYL_APP_KEY` are needed as well; they are the address of the panel
and the administrative key, and the backend uses them for the administration of the accounts.

When one of the two variables on the Blipmade side is missing, the backend says that the panel
cannot issue a client key for the customer yet, and no customer operation runs.

---

## The installation

The bridge is installed **on the panel host** (VM 100), as root.

1. Copy the directory `panel-bridge/` of this repository to the panel host.

2. Run the installer. It detects the panel directory, copies the controller and the configuration,
   registers the route, adds the variables to the `.env` of the panel, clears the caches of the
   panel and prints the secret:

   ```bash
   cd panel-bridge
   ./install.sh /var/www/pterodactyl 203.0.113.10
   ```

   The first argument is the panel directory (default `/var/www/pterodactyl`, also read from
   `PANEL_DIR`), the second is the public address of the Blipmade server, which goes into the
   list of allowed addresses. The script may be run again at any time: it never overwrites an
   existing secret and it never deletes a file.

3. Put the two lines that the installer printed into the `.env` of Blipmade
   (`/opt/blipmade/.env` on the control plane host):

   ```
   PANEL_KEYMINT_URL=https://<the host of the panel>/api/blipmade/keymint
   PANEL_KEYMINT_SECRET=<the secret that the installer printed>
   ```

4. Restart the API and the worker of Blipmade, they read the `.env` when they start:

   ```bash
   cd /opt/blipmade
   docker compose -f compose.yml -f compose.api.yml -f compose.web.yml restart api worker
   ```

---

## The removal

1. Remove the route from `routes/api.php` of the panel. It is the block that starts with the
   marker `// Blipmade panel bridge` and ends with the name of the route:

   ```bash
   cd /var/www/pterodactyl
   sed -i '/\/\/ Blipmade panel bridge/,/api\.blipmade\.keymint/d' routes/api.php
   ```

2. Delete the two files of the bridge:

   ```bash
   rm -f app/Http/Controllers/BlipmadeKeyMintController.php
   rm -f config/blipmade_bridge.php
   ```

3. Clear the caches of the panel:

   ```bash
   php artisan optimize:clear
   ```

4. Remove `PANEL_KEYMINT_URL` and `PANEL_KEYMINT_SECRET` from the `.env` of Blipmade and restart
   the API and the worker.

The keys that were already handed out stay valid on the panel until they are revoked there. Revoke
them under **Account → API Keys** of the panel, or let them expire.

---

## The test from the Blipmade side

The snippet below is the example of the signing side. It is the same code the backend uses, and
it is here so that both implementations can be compared.

```js
// Node 18 or newer. Run it on the Blipmade host with the .env of Blipmade loaded.
import { createHmac, randomBytes } from 'node:crypto';

const url = process.env.PANEL_KEYMINT_URL;
const secret = process.env.PANEL_KEYMINT_SECRET;
const externalId = 'blipmade_acc_<the id of the customer>';

const timestamp = Math.floor(Date.now() / 1000).toString();
const nonce = randomBytes(16).toString('base64url');

// The same construction as the panel: timestamp . '.' . nonce . '.' . external_id
const signature = createHmac('sha256', secret).update(`${timestamp}.${nonce}.${externalId}`).digest('hex');

const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ external_id: externalId, timestamp, nonce, signature }),
});

console.log(response.status, await response.text());
```

A working bridge answers `200` and a body that carries a key starting with `ptlc_`.

The same request in a shell:

```bash
TIMESTAMP=$(date +%s)
NONCE=$(openssl rand -base64 18 | tr '+/' '-_' | tr -d '=\n' | cut -c1-24)
EXTERNAL_ID=blipmade_acc_<the id of the customer>
SIGNATURE=$(printf '%s' "$TIMESTAMP.$NONCE.$EXTERNAL_ID" \
  | openssl dgst -sha256 -hmac "$PANEL_KEYMINT_SECRET" -hex | awk '{print $2}')

curl -sS -X POST "$PANEL_KEYMINT_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"external_id\":\"$EXTERNAL_ID\",\"timestamp\":\"$TIMESTAMP\",\"nonce\":\"$NONCE\",\"signature\":\"$SIGNATURE\"}"
```

---

## Troubleshooting

| what is seen | what it means | what to do |
|---|---|---|
| `401` `unauthorized` | the signature does not match, or the clock is wrong. | Check that `PANEL_KEYMINT_SECRET` on Blipmade and `BLIPMADE_KEYMINT_SECRET` on the panel are the same string. Check that the clock of both hosts is right (`chronyc tracking`, or `timedatectl`). A difference of more than 60 seconds is refused. |
| `401` `replayed` | the same nonce was sent twice. | Nothing is wrong. The backend asks for a new nonce for every request. A retry with the same body is refused on purpose. |
| `400` `invalid_request` | a field is missing or has the wrong shape. | Check that `external_id` starts with `blipmade_acc_`, that `timestamp` is digits only, that `nonce` is 16 to 64 characters of `A-Z a-z 0-9 _ -`, and that `signature` is 64 characters of hex. |
| `404` `not_found` | the account of the customer does not exist on the panel yet, or it is a root administrator. | The account is created when the customer is provisioned. Until then there is nothing to sign a key for. The `external_id` of the customer has to be set on the panel account: `blipmade_acc_<the id of the customer>`. |
| `503` `disabled` | the bridge is switched off. | `BLIPMADE_KEYMINT_SECRET` is missing or shorter than 32 characters, or `BLIPMADE_KEYMINT_ALLOWED_IPS` is empty on the panel. Set both and run `php artisan optimize:clear` on the panel. |
| `429` | the throttle spoke. | More than 30 requests in a minute. The backend asks for a key once per customer and then keeps it, so this does not happen in normal operation. |
| `404` on the address itself | the route is not registered. | Check that the block `// Blipmade panel bridge` is in `routes/api.php` of the panel and that `php artisan optimize:clear` was run. |
| the key works, but the panel refuses it with `403` | the key was made for a different account, or the address is not in the list. | The list of allowed addresses must name the public address of the Blipmade server, and the key must have been made for the account of that customer. |

The refusals are written to the log of the panel, with the reason and never with the secret:

```bash
grep 'Blipmade key mint refused' /var/www/pterodactyl/storage/logs/laravel.log
```
