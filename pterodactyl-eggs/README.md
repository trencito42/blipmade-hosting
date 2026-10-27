# The eggs of the panel

These are the official eggs of Pterodactyl that the platform needs:

| File | Egg | Image | Password |
| --- | --- | --- | --- |
| `postgres16.json` | Postgres 16 | `ghcr.io/ptero-eggs/yolks:postgres_16` | the platform makes one for every instance |
| `code-server.json` | Code-Server | `ghcr.io/ptero-eggs/yolks:nodejs_18` | the platform makes one for every instance |
| `uptime-kuma.json` | Uptime Kuma | `ghcr.io/ptero-eggs/apps:uptimekuma` | the account is made by the application itself |

The files are a copy of the ones in
[the repository of Pterodactyl](https://github.com/pterodactyl/application-eggs),
in the format the panel reads. They are checked by `scripts/fetch-eggs.mjs`,
which also refreshes them.

The panel does not read the eggs of a repository on its own: the eggs have to
be imported into the panel, one by one, by an administrator. The Application
API of the panel can read the eggs but cannot create them, so this is the one
step that has to be done in the interface of the panel.

## How to import them

1. Sign in to the panel of the platform as an administrator: `https://panel.blipmade.com`.
2. Open **Administration → Nests** and open the nest **Discord Bots** (the one
   with the eggs of Node.js and Python in it).
3. Press **Import Egg**.
4. Choose the file, press **Import**, and answer the question about the nest
   with **Discord Bots**.

Repeat it for the three files. The nest may be renamed afterwards; the name is
only a label in the interface of the panel.

The files can also be fetched with `curl` from the repository of the platform:

```
https://raw.githubusercontent.com/trencito42/blipmade-hosting/main/pterodactyl-eggs/postgres16.json
https://raw.githubusercontent.com/trencito42/blipmade-hosting/main/pterodactyl-eggs/code-server.json
https://raw.githubusercontent.com/trencito42/blipmade-hosting/main/pterodactyl-eggs/uptime-kuma.json
```

## How to check that the import worked

The Application API of the panel answers with the eggs of a nest:

```
curl -sS -H "Accept: application/json" \
  -H "Authorization: Bearer $PTERODACTYL_APP_KEY" \
  "$PTERODACTYL_URL/api/application/nests/5/eggs" | grep -o '"name":"[^"]*"'
```

The names of the three eggs have to be in the answer: `Postgres 16`,
`Code-Server` and `Uptime Kuma`.

The platform then finds the eggs by their name, so the number the panel gave
them does not matter. The variables of the eggs are known to the platform and
are written in the environment of every server that is created on them.

## What the platform does with them

- The products of the catalog name the egg they run on: `postgresql` names
  `Postgres 16`, `code-server` names `Code-Server` and `uptime-kuma` names
  `Uptime Kuma`.
- The environment of every instance of these products is written from the
  template of the egg, with the password replaced by one that is made for that
  instance.
- A product is only opened for ordering after a server of it was really built
  and answered on the node.
