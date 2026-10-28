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

## The price of a server

A server is priced by what it uses, and by nothing else:

```
ramPerGb  × gigabytes of memory
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
| `ramPerGb` | 100 | the price of a gigabyte of memory, for a month |
| `cpuPerUnit` | 50 | the price of a processor, for a month |
| `diskPerGb` | 10 | the price of a gigabyte of storage, for a month |

The card is changed in the back office, in the page of the prices. Writing it
there writes it for every product of the platform at once, and the rows of the
prices are brought back to it, so the back office shows the card that is
really used.

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
