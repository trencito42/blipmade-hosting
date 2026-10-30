# The headless panel

Blipmade owns the customer. The Pterodactyl panel is a backend: no customer
signs in to it, nothing links to it and nothing of it is shown. Every server
operation a customer runs goes through the API of Blipmade.

This document describes how that works, which rule each part follows and what
still needs an action from the operator.

## The two identities

A customer has two identities and they are linked by one permanent link:

| | Blipmade | Pterodactyl |
|---|---|---|
| the name | the two parts the customer gave | the same two parts, never invented |
| the address | the address of the customer | a reserved address that cannot receive mail |
| the link | `User.id` | `external_id = blipmade_acc_<User.id>` |

The external id is the **only** thing that is used to find the panel account
again. An address is never used for that, because an address can be typed by
hand, can be changed and can already belong to somebody else. An account of the
panel that Blipmade did not create is therefore never taken over, not even when
the address matches.

The password of the panel account is random and is not kept. The customer never
signs in to the panel, so there is nothing to reset and nothing to hand over.

`services/panel/identity.ts` holds this logic.

## The credential of a customer

Power, the console, the files, the backups, the databases, the schedules and
the addresses live on the **client API** of the panel. That API refuses the
administrative key of the panel, so every customer needs a key of their own:

```
ptlc_<the identifier of 16 characters><the secret of 32 characters>
```

That key is scoped to the panel account of the customer, so it can only ever
reach the servers of that customer. The panel checks the ownership of the
server again on its side, on every request.

The key is kept encrypted in `PanelCredential.tokenEnc` and never reaches the
browser. The administrative key of the panel (`PTERODACTYL_APP_KEY`) never
reaches the browser either.

### Where the key comes from

The panel has no route that issues a client key: the application API has no
token route and the client API refuses the application key. A credential that
is scoped to one customer can therefore only be created by code that runs
inside the panel.

There are two ways in, and both end in the same place: one encrypted key per
customer in the database.

1. **The bridge of the panel** (the normal way). `panel-bridge/` adds one
   endpoint to the panel that issues a key for one customer, and only for one:
   the request is signed with a secret that both sides know, the time is
   checked, and the nonce may only be used once. See `docs/PANEL_BRIDGE.md`.

2. **The way of the operator** (the way in while the bridge is not installed
   yet). An operator creates a key in the panel and hands it over through
   `POST /api/admin/customers/:id/panel/credential`. The key is stored the
   same way and is never sent back to the browser.

Without one of the two, the customer operations answer `503 unavailable` and
say why. Nothing is faked and no operation falls back to the administrative
key.

### The rules of every operation

- The instance is loaded **for the customer that asks for it**. An instance of
  somebody else answers `404`, exactly like an instance that does not exist, so
  an identifier cannot be probed.
- The key that is used is the key of that customer, so the panel refuses a
  server of somebody else a second time.
- The destructive operations (delete a file, drop a database, remove a backup,
  reinstall a server) leave a trace in the event list of the instance and in
  the audit log.
- The console is a relay. The browser opens a socket on Blipmade and Blipmade
  relays it to the node of the panel. The address of the node and the token of
  the console stay on the server.

## The panel API

Not every operation runs with the key of the customer. The application API of
the panel is the administrative one and it is used for the things the panel
only allows for the owner of the deployment:

| operation | API of the panel | why |
|---|---|---|
| create the account of a customer | application | only the application API can create a user |
| create the server, the build, the startup | application | the client API cannot create a server |
| the image, the startup command, the environment | application | the client API of the panel cannot change them |
| the name and the description on the panel | application | same |
| power, the console, the files, the backups, the databases, the schedules, the addresses | client | these belong to the customer |
| the activity of the server | client | same |

Both paths check the ownership of the instance first. The administrative key
never leaves the server.

## The provisioning

`provisionInstance()` runs the steps in order and records the last step that
worked in `Instance.provisionStep`, so a retry continues instead of starting
over:

| step | what it does |
|---|---|
| `node_selected` | a node with room and a free address |
| `server_created` | the server is created for the panel account of the customer |
| `image_built` | the installation is requested once |
| `installed` | the installation is waited for |
| `started` | the container is started with the key of the customer |
| `activated` | the service answers on its own address |

Two rules are worth naming:

- **The address is the one the panel assigned.** The allocation that the panel
  really gave is stored in `Instance.pterodactylAllocation` and the port is
  read from it. No port is ever assumed.
- **A retry never reinstalls a server.** The state of the server is read again
  on every run, and a server that is already installed is never installed a
  second time, because the panel wipes the files of a server that is
  reinstalled.

## The routes

Everything lives under `/api/instances/:id` and needs a session of the
customer that owns the instance.

| tab | routes |
|---|---|
| overview | `GET /server`, `GET /resources`, `GET /activity`, `GET /events` |
| console | `GET /console`, `WS /console/stream`, `POST /command`, `POST /power` |
| files | `GET /files`, `GET /file`, `PUT /file`, `DELETE /file`, `POST /files/rename`, `POST /files/move`, `POST /files/copy`, `POST /files/compress`, `POST /files/decompress`, `POST /files/chmod`, `POST /files/upload`, `GET /files/download` |
| databases | `GET /databases`, `POST /databases`, `PATCH /databases/:id`, `DELETE /databases/:id`, `GET /databases/:id/credentials` |
| backups | `GET /backups`, `POST /backups`, `GET /backups/:id/download`, `POST /backups/:id/restore`, `DELETE /backups/:id` |
| network | `GET /allocations`, `POST /allocations`, `PUT /allocations`, `PATCH /allocations/:id`, `DELETE /allocations/:id` |
| startup | `GET /startup`, `PUT /startup` |
| schedules | `GET /schedules`, `POST /schedules`, `PATCH /schedules/:id`, `DELETE /schedules/:id`, `POST /schedules/:id/run` |
| settings | `GET /settings`, `PATCH /settings`, `POST /settings/reinstall`, `POST /suspend` |

The full shape of every answer is in `docs/API_CONTRACT.md`.

## What is still missing

| what | what it needs |
|---|---|
| the key of a customer | the bridge of the panel installed, or one key handed over by an operator |
| the start of the container during the provisioning | the same |

Both are the same blocker: the panel cannot issue a client key by itself. See
`docs/PANEL_BRIDGE.md` for the installation.


## Secure file and backup downloads

Pterodactyl 1.x `/files/download` and `/backups/{backup}/download`
return a temporary signed URL as JSON, not the actual bytes. Blipmade
reads the signed URL on the API server, validates its HTTPS destination and
streams the actual download to the authenticated customer. The bearer token
of the panel and the signed URL never leave the backend.

Configure exact signed download hosts in the platform API and worker:

```dotenv
# The source node hostname used by the Pterodactyl signed URL:
PTERODACTYL_DOWNLOAD_HOSTS=node1.example.com:8080
```

`PANEL_NODE_ADDRESSES` source node hosts are accepted automatically as an
additional allowlist. Add other hosts (for example a strictly designated
object-storage hostname) only when needed, separated by commas. Enter the
*exact host and port* that appears in the signed HTTPS URL. No wildcard
hosts, public HTTP, arbitrary redirects, loopback or cloud metadata
endpoints are trusted by default.

The API must be able to reach the allowed HTTPS host with valid TLS. If the
node is reachable only through a private address, configure the network path
and certificate deliberately; do not disable TLS verification. A missing
allowlist causes downloads to fail closed with a configuration error.

**Validation on staging:** download a small file, a large file and a backup;
verify correct bytes/checksum, an interrupted download, and rejection of a
signed link/redirect to an unlisted host. Validate the size and browser
behavior through the complete Cloudflare → Caddy → API chain.

Do not expose signed Wings URLs or Pterodactyl credentials in logs, API
responses, application telemetry or support tickets.
