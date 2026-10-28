# The eggs of the panel

This folder holds the eggs the platform runs on, and the manifest that says
what each product of the catalog is.

## The three eggs of the platform

| File | Egg | Image | Password |
| --- | --- | --- | --- |
| `postgres16.json` | Postgres 16 | `ghcr.io/ptero-eggs/yolks:postgres_16` | the platform makes one for every instance |
| `code-server.json` | Code-Server | `ghcr.io/ptero-eggs/yolks:nodejs_18` | the platform makes one for every instance |
| `uptime-kuma.json` | Uptime Kuma | `ghcr.io/ptero-eggs/apps:uptimekuma` | the account is made by the application itself |

They are a copy of the ones in
[the repository of Pterodactyl](https://github.com/pterodactyl/application-eggs),
in the format the panel reads. They are checked by `scripts/fetch-eggs.mjs`,
which also refreshes them.

## The eggs of the catalog

The other files are the eggs of the three repositories of Pterodactyl:
`game-eggs` (the games), `application-eggs` (the applications) and
`generic-eggs` (the runtimes). There is one file per product, named after
the slug of the product.

`manifest.json` is the truth of the catalog: it names the products, their
category, their icon, their resources, the values the customer fills at the
order and where they stand in the catalog. The whole of it is described in
[`docs/CATALOGUE.md`](../docs/CATALOGUE.md).

## How to import them

The panel does not read the eggs of a repository on its own: the eggs have to
be imported into it, one by one. The Application API of the panel can read
the eggs but cannot create them, so the import goes through the service of the
panel itself — the same parser the button of the interface uses
(**Administration → Nests → Import Egg**).

On the host of the panel:

```bash
bash /root/blipmade-panel-tools/import-eggs.sh /root/blipmade-eggs
```

The script is idempotent: an egg whose name is already in the nest is not
imported a second time, and the id that is already in use is printed. It
prints one line per egg: the id, the name, the file and what it did.

The three eggs of the platform can also be imported by hand in the
interface of the panel: sign in as an administrator, open **Administration →
Nests**, open the nest **Discord Bots** (the one with the eggs of Node.js and
Python in it), press **Import Egg** and choose the file.

## How to check that the import worked

The Application API of the panel answers with the eggs of a nest:

```
curl -sS -H "Accept: application/json" \
  -H "Authorization: Bearer $PTERODACTYL_APP_KEY" \
  "$PTERODACTYL_URL/api/application/nests/5/eggs" | grep -o '"name":"[^"]*"'
```

The platform finds the eggs by their name, so the number the panel gave them
does not matter. The importer of the catalog fills the number anyway, so the
product keeps working when the egg is imported again under another number.

## How the catalog is rebuilt

The eggs and the manifest are written out of the clones of the three
repositories by `build-manifest.py`:

```bash
python3 pterodactyl-eggs/build-manifest.py /tmp/ptero-eggs
```

The generator refuses a slug that is used twice: two products that write the
same file of eggs would leave one of them with the egg of the other.

## What the platform does with them

- The products of the catalog name the egg they run on, and the manifest says
  which one.
- The environment of every instance of a product is written from the template
  of the egg, with the password replaced by one that is made for that
  instance, and with the values the customer gave at the order.
- A product is only opened for ordering after a server of it was really built
  and answered on the node.
