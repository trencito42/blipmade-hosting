# The catalogue of the platform

The catalogue is the list of what the platform can sell. It is made of two
things that live in the same place, `pterodactyl-eggs/`:

* the **eggs**, one file per product, copied from the repositories of
  Pterodactyl and renamed when the platform needs a name of its own;
* the **manifest**, `pterodactyl-eggs/manifest.json`, which says what each
  product is: its name, its category, its icon, its egg, its resources, where
  it stands in the catalogue and the values the customer fills at the order.

The manifest is the truth of the catalogue. The products of the database are
written out of it, the seed writes them into a scratch database, and the
import of the catalogue brings the live database back to it.

## What is in the catalogue

| group | products | what they are |
| --- | --- | --- |
| games | 33 | the games of Steam, with the eggs of `pterodactyl/game-eggs` |
| apps | 23 | the applications, with the eggs of `pterodactyl/application-eggs` |
| generics | 10 | the runtimes, with the eggs of `pterodactyl/generic-eggs` |

Every product of the manifest names the egg it runs on, the image of Docker it
uses, the resources it runs with and the variables of the customer.

The eggs are imported into the panel by the service of the panel itself, the
same way the button of the interface does it
(`Administration → Nests → Import Egg`). They live in the nest 5, and the
number of an egg belongs to the panel: a product names its egg, and the
importer of the catalogue fills the number when the panel carries it.

### The resources of a product

Every product carries the resources it runs with: the least it runs with, what
it gets by default and the most the platform lets it have.

The floor of the platform is a commercial choice: the products are put in
bands (a light service, an application, a database, a small game, a big game)
and every product of a band starts with the same resources. When the egg of a
product states what it needs, that requirement wins over the band, because a
customer must not be able to buy a configuration that the egg says is too
small. Ten products were checked against their own upstream file on
2026-10-28 and their floor was raised:

| product | memory | processors | what the egg says |
| --- | --- | --- | --- |
| CS2D | 1024 MiB | 1 | one gigabyte of memory is recommended (`game-eggs/cs2d/README.md:17`) |
| Conan Exiles | 6144 MiB | 2 | about six gigabytes of memory (`game-eggs/conan_exiles/README.md:9`) |
| Loki | 3072 MiB | 1 | a minimum of three gigabytes of memory (`application-eggs/loki/README.md:15`) |
| Palworld | 16384 MiB | 4 | sixteen gigabytes of memory and four processors (`game-eggs/palworld/README.md:86` and `:90`) |
| Prometheus | 3072 MiB | 1 | a minimum of three gigabytes of memory (`application-eggs/prometheus/README.md:10`) |
| Redis | 4096 MiB | 1 | four gigabytes of memory are recommended (`application-eggs/redis/README.md:13`) |
| Satisfactory | 8192 MiB | 2 | eight gigabytes of memory (`game-eggs/satisfactory/README.md:111`) |
| Sons of the Forest | 8192 MiB | 2 | a minimum of eight gigabytes of memory (`game-eggs/sons_of_the_forest/README.md:29`) |
| Space Engineers | 6144 MiB | 2 | about six gigabytes of memory (`game-eggs/space_engineers/README.md:33`) |
| Team Fortress 2 | 2048 MiB | 2 | two processors (`game-eggs/team_fortress_2/README.md:11`) |

The other fifty-six products keep the floor of their band: their egg states
no requirement of memory, of processor or of storage, so nothing was invented
for them. The storage is the floor of the band everywhere: no egg of the
catalogue states how much disk it needs.

## The price of a server

A server is priced by what it uses, and by nothing else:

```
baseFee
+ ramPerGb  × gigabytes of memory
+ cpuPerUnit × vCPU
+ diskPerGb × gigabytes of storage
```

The same resources cost the same in every product. A product that would be
cheap because it asks for few resources could be bought by a customer that
wants something else in it, and the resources they really use would be paid
for by nobody. The rates are one card for the whole platform, and the card is
kept in the settings under the key `pricing_resources`:

| rate | default | meaning |
| --- | --- | --- |
| `ramPerGb` | 200 | the price of a gigabyte of memory, for a month |
| `cpuPerUnit` | 75 | the price of a processor, for a month |
| `diskPerGb` | 5 | the price of a gigabyte of storage, for a month |
| `baseFee` | 49 | the fee of the instance itself, whatever it holds, for a month |

The card is changed in the back office, in the page of the prices. Writing it
there writes it for every product of the platform at once, and the rows of the
prices are brought back to it, so the back office shows the card that is
really used.

The card, the arithmetic, the policy of the prices that already exist and the
policy of the shared processors are described in
[`PRICING.md`](PRICING.md).

The card is the price of a month. A year is the twelve months of that card:
a product without a yearly price is refused when a year is quoted, so the
period of the price is never replaced by the price of another period.

A plan of hosted mail is a subscription of a service, and it keeps its own
base price. The mail is not a server, and the resources of a plan are part of
what is bought.

## The values the customer fills at the order

Some eggs ask for something that only the customer holds: the account of a
vendor, the licence of a game, the key of an API, the repository of a service.
The product declares those values:

```json
{
  "STEAM_USER": { "label": "Steam account", "required": true, "type": "text" },
  "STEAM_PASS": { "label": "Password of the Steam account", "required": true, "type": "password" }
}
```

The flow is the same for every product:

1. the catalogue publishes the declaration, and the page of the product shows
   a field for each value;
2. the customer fills them at the order; the order cannot be reviewed while a
   required value is empty, and a value that the product does not ask for is
   refused;
3. the platform seals the values with the same secret as the values it makes
   itself, and keeps them on the instance;
4. the deployment writes them into the environment of the container, where the
   egg reads them the way it reads its own variables.

The values are the secrets of the customer: they are never written in the
clear, never put in an address, and never sent to the panel as something else
than the environment of the container.

The declarations are in the generator of the manifest
(`pterodactyl-eggs/build-manifest.py`), and each of them names a variable the
egg really has: the generator refuses to write a manifest that declares a
variable the egg does not carry.

## A product opens for ordering only after a probe

The eggs are imported and the products are listed, but a product stays closed
for ordering until a server of it was really built on a node and answered.
The flag is `deployable` on the product, and it is set by hand in the back
office after the probe.

The reason is the cost of the other way round: a customer who pays for a
product that cannot be built is refunded, and the platform loses the trust it
needs to sell the products that work.

The games that need a licence of the customer cannot be probed without one.
They stay closed, and the reason is written in the catalogue.

The EULA of Minecraft is the one that matters here, because the eggs of
Minecraft declare the feature `eula` and their install script has to write the
acceptance in the container. An egg that declares the feature and does not
write it starts a server that reads no acceptance and stops with the line "You
need to agree to the EULA in order to run the server.", so the product never
answers on its port. The eggs of the platform carry the variable `EULA`, which
the host sets for the instances it runs, and the lines of the install script
that write the acceptance.

An egg of the panel is changed through the service of the panel, so it keeps
the number the products point at:

```bash
php /root/blipmade-panel-tools/blipmade-update-egg.php \
  /tmp/minecraft-paper.json "Paper" 5
```

The file the panel is given ends its lines with LF, the shape the live eggs
already have: a script with CRLF stops at its first line, because the
carriage return becomes part of the command.

### The probe is a script, not a habit

The probe is `scripts/probe-eggs.mjs`. It does the same steps as the
provisioning of the platform, on the panel itself:

1. the egg of the product is resolved the way `resolveEgg()` does it, by
   number and by name;
2. the environment of the egg is read from the panel, and the values of the
   customer are laid over it;
3. the server is created with the image of the product, and the node installs
   it, which pulls the image and runs the install script of the egg;
4. the application of the platform is written into the container, so the
   start-up command of the egg finds something to run;
5. the container is started, and the port of the allocation is asked;
6. the server is deleted, and the address is given back to the panel.

The verdict is read the way the platform checks a deployment:

| what the probe saw | what it means | what the platform does |
| --- | --- | --- |
| the service answers on the port with HTTP | the product is ready | the product is opened, with the default check |
| the port takes a connection but the service does not speak HTTP | the service is a database or a game | the product is opened, with a check of the connection |
| the container was built and started, and nothing answers on the port | the product needs something the platform does not have yet | the product stays closed |
| the panel refused the server | the egg wants a value that nobody was asked for | the product stays closed |

The probe runs inside the API container, where the key of the panel and the
database are:

```bash
sudo docker exec --env-file /home/debian/probe.env \
  -e PROBE_OUTPUT=/tmp/probe.json -e PROBE_WAIT_MS=420000 \
  blipmade-api-1 node /app/scripts/probe-eggs.mjs \
  --concurrency 4 --products nodejs,redis,minecraft-paper
```

`scripts/open-products.mjs` reads the result of the probes and opens the
products that answered, with the check that fits the service, and writes what
it did in the journal of the platform. It does nothing without `--apply`.

A product that is opened has to follow into the site, otherwise the customer
sees a product that cannot be ordered:

1. the measurement is written in `scripts/product-probes.json`, so the guide of
   the product is written from it and not from the hand of a writer;
2. `node scripts/build-product-guides.mjs` writes the guide of the product, and
   `node web/scripts/sync-docs-meta.mjs` refreshes the summary of the
   documentation;
3. `node web/scripts/sync-catalog.mjs` refreshes the snapshot of the catalogue
   the site is built with;
4. the web image is built and deployed.

### The environment of an egg

The panel refuses to create a server whose environment does not carry the
variables of the egg. The eggs the platform knows have their template kept in
`api/src/services/pterodactyl/application.ts`, and they are used exactly as
they are: the password of the database of a customer and the name of its user
are part of what the customer is told.

An egg the platform does not know is read from the panel, which knows the
variables of every egg it has (`include=variables`). This is what lets the
first server of an egg be created by the platform and not only by hand
through the panel.

The panel refuses a server whose variable is marked as required and left
empty. The eggs of the games ask for such a variable and give it no value of
its own: the token of the server of Unturned is the one, and that server was
refused with "The GSLT variable field is required" before it ever started. The
platform makes the value of those variables (`api/src/services/pterodactyl/
environment.ts`), the same way it makes the passwords of the products it
sells, and the probe does the same, so the probe measures the product and not
the refusal of the panel.

### The mirror of the eggs

The back office keeps a copy of the eggs of the panel, so it can show them
without asking the panel for every page. The copy is refreshed with
`scripts/sync-eggs.mjs`, which does the work of the button of the back office
without a session of an administrator.

## The import of the catalogue

The importer reads the manifest and writes the products into the database. It
is idempotent: a product that is already there is brought back to what the
manifest says, except for two things that belong to the operator:

* the flag that opens the product for ordering;
* the price, which is the card of the platform and not a number of the
  manifest.

The products that the manifest does not name are left alone. The five
products that were on the platform before the catalogue of the eggs are not in
the manifest, and they keep the state the operator gave them.

On the host of the platform:

```bash
cd /opt/blipmade
ALLOW_PRODUCTION_SEED=true scripts/import-catalogue.sh
```

The script refuses the live database when the permission is not given, for
the same reason the seed refuses it: the live database holds the accounts, the
orders and the services of the customers.

## The catalogue of the eggs is rebuilt from the upstream

The generator writes the eggs and the manifest out of the clones of the three
repositories of Pterodactyl:

```bash
git clone --depth 1 https://github.com/pterodactyl/game-eggs /tmp/ptero-eggs/game-eggs
git clone --depth 1 https://github.com/pterodactyl/application-eggs /tmp/ptero-eggs/application-eggs
git clone --depth 1 https://github.com/pterodactyl/generic-eggs /tmp/ptero-eggs/generic-eggs
python3 pterodactyl-eggs/build-manifest.py /tmp/ptero-eggs
```

The generator refuses a slug that is used twice. Two products that write the
same file of eggs would leave one of them with the egg of the other, and the
catalogue would show a game that runs something else.
