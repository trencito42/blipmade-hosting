# Smart Connect (#24)

A clean hostname for a game server, with no proxy, no NAT change and no address of its own. Blipmade writes two records in
its own zone; the client asks for the SRV record and connects to the real port of the Pterodactyl allocation.

* **Namespace:** `<label>.GAME_JOIN_DOMAIN` (default `play.blipmade.com`, which has to be inside the platform zone). The
  label is the name of the server in plain letters plus four random characters, unique in `GameConnect.label`, never a
  reserved name (`www`, `ingress`, `api`, `mail`, `admin`, `app`, `status`, `ns*`, `play` and others).
* **Records:** `A <label>.<domain> -> <public address>` and `SRV _<service>._<proto>.<label>.<domain> -> 0 5 <real port> <label>.<domain>`,
  both DNS-only. The address is a public one: the allocation, its alias, or `GAME_PUBLIC_ADDRESS`. A private address is
  never published.
* **Registry** (`api/src/services/game-connect.ts`, `GAME_PROFILES`), keyed by what the server runs:

  | Profile | SRV | State |
  |---|---|---|
  | `minecraft-java` (Paper, Folia, Forge) | `_minecraft._tcp` | on, no client test recorded |
  | `factorio` | `_factorio._udp` | on, experimental: desktop clients only, Switch does not use it, no client test recorded |
  | `fivem` | `_cfx._udp` | **off**: Direct Connect, F8 `connect` and the server browser have to be tested one by one |

  Bedrock, Rust, Terraria, CS2 and Valheim are not in the registry: they keep `address:port`.
* **States:** `PENDING_DNS` (written, not answering yet), `DNS_VERIFIED` (the DNS answers with the port and the address that
  were written), `CLIENT_VERIFIED` (set by hand after a real join; a change of the port clears it), `DEGRADED` (it answered
  and no longer does), `UNSUPPORTED`. DNS answering is never shown as a game that joined.
* **Lifecycle:** `syncGameConnect` is idempotent (nothing is written when the address and the port are the same). The worker
  runs `reconcileGameConnects` every five minutes: it gives eligible servers their hostname, removes the hostnames of
  servers that were cancelled or deleted (the row outlives the instance on purpose, so the records are removed first), and
  checks the rest again. Only the records whose ids were stored are removed.
* **Custom domains:** a customer's own game domain (Domains, purpose `game`) takes the SRV service from the same registry
  (`InstanceDomain.srvService`), and is written through the Cloudflare flow of #23 (preview, approval, idempotent).
* **Flag:** `GAME_CONNECT_ENABLED` (default off). With it off the API answers `enabled: false`, the dashboard shows nothing
  and the worker does nothing.
* **Not done here:** a real client join for any game, the `CLIENT_VERIFIED` switch for staff, AAAA records, and the E2E of
  two servers of one game on one public IP (needs a staging node).
