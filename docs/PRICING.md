# Pricing

The price of a server is the price of what it holds, plus the fee of the
instance itself. The same resources cost the same in every product, in every
category and for every egg: a customer who took the cheapest entry of the
catalog and put something else in it pays for the resources they really use.

This page describes the card, the arithmetic, the policy of the prices that
already exist and the policy of the shared processors. It describes the
platform as it is built; every number on this page is a number the code uses.

## The card of the platform

One card for the whole platform, kept in the setting `pricing_resources`:

| Rate | Meaning | The card of 2026-10-28 |
|---|---|---|
| `ramPerGb` | one gigabyte of memory, for a month | 200 cents |
| `cpuPerUnit` | one shared processor, for a month | 75 cents |
| `diskPerGb` | one gigabyte of storage, for a month | 5 cents |
| `baseFee` | the instance itself, whatever it holds, for a month | 49 cents |

The price of a configuration, for a month, is:

```
baseFee + gigabytes of memory × ramPerGb + vCPU × cpuPerUnit + gigabytes of disk × diskPerGb
```

The card is written in the settings **and** in every row of the prices of the
servers, so the back office and the quotes show the same numbers. It is
changed from the back office (`Pricing → Rate card of the platform`) or with
the script that writes it:

```bash
ALLOW_PRODUCTION_SEED=true scripts/set-rate-card.sh 200 75 5 49
```

The arguments are, in order: the cents of a gigabyte of memory, the cents of
a processor, the cents of a gigabyte of disk and the cents of the fee of the
instance. Without them the card that is already there is kept.

The card is read from the settings at most every thirty seconds, so a card
that was changed reaches the whole platform within half a minute. The change
itself is immediate for the operator who writes it.

A **plan of hosted mail** is priced differently, on purpose. A plan is a
subscription of a service and the plan itself is what the customer buys, so
it keeps its own base price and it is not broken into resources.

## The arithmetic

Every amount of the platform is an integer number of minor units (cents).
The price of a configuration is computed with integers and a common
denominator, and it is rounded **once**, at the end, to the nearest cent,
with a half rounded up:

- the memory is counted in MiB (1024 MiB are one gigabyte that is billed),
- the processor is counted in hundredths (a vCPU is a hundred parts),
- the common denominator is 1024 × 100 = 102400.

A price that was computed with floating point and rounded at the end would be
off by a cent from time to time, and the customer would be charged a cent
that the catalog did not show.

The breakdown of the price — the price of the memory, of the processor, of the
storage, of the instance and of the add-ons — is published with the quote.
The parts add up to the total: the rounding is done once, on the sum, and the
minor unit that is left over goes to the part that lost the most in the
rounding, so the customer sees a breakdown that adds up.

A **year is twelve months of the card**. The card of the resources is the
price of a month, so the price of a year is twelve times the price of a
month, and the breakdown of a year is twelve times the breakdown of a month.
The add-ons are chosen by the customer and are priced once, not once a month.

## One engine

There is one place where the price of a server is calculated:
`api/src/services/pricing.ts`.

| Function | What it answers |
|---|---|
| `priceOfResources` | the price of a configuration, for a month |
| `breakdownOfResources` | the parts of that price |
| `breakdownForPeriod` | the parts of that price, for the period of an order |
| `priceConfiguration` | the price of a line of an order, add-ons included |
| `priceBook` | the two configurations the catalog talks about, and their prices |
| `validateConfiguration` | whether a configuration fits the limits of a product |

Everything else asks these functions: the catalog, the quote, the order, the
upgrade, the reconciliation of the prices and the invoices. The interface
never derives an amount of its own: the configurator shows the numbers the
server sent with the quote.

## Half of a processor

A processor is a share of a processor, and a share may be a half: a small bot
of half a processor is a thing the panel can build and to sell.

- the memory is counted in MiB, in whole numbers,
- the storage is counted in GB, in whole numbers,
- the processor is counted in hundredths, and the step of the selector is a
  half: 0.5, 1, 1.5, 2 and so on.

A quarter of a processor is refused by the server, and the interface never
offers it. The columns of the processor are decimals in the database
(`api/prisma/schema.prisma`), and the migration that changed them is
additive: the values that were in the table are the values that stayed.

## The policy of the prices that already exist

A running instance keeps the price it was sold at.

Changing the card does **not** change the price of the running instances, and
it does not change the price of the subscriptions that the customers already
have. The reconciliation of the prices is an action of the operator:

```http
POST /api/admin/instances/reconcile-prices
```

The reconciliation recomputes the price of every instance from the
configuration it runs, writes the difference to the journal of the instance
and to the audit trail, and is safe to run again: an instance whose price is
already the price of its configuration is left alone.

## The policy of the shared processors

The panel publishes the memory and the disk of a node. It does **not** publish
the processor, so the processor of a node is declared by the operator and the
platform never assumes that the whole capacity of the machine is available
for the customers:

```
sellable vCPU of a node = declared cores × factor of oversubscription
```

- the cores of the nodes are declared in the setting `capacity.node_cores`,
  as an object of node number and cores;
- the factor of the oversubscription is declared in the setting
  `capacity.cpu_oversubscription`; it is 4 by default;
- a node that was never declared sells 4 cores, so it cannot be filled to the
  brim by accident.

At the moment of the provisioning, the node is chosen among the ones that
have room for the memory, for the disk **and** for the processor. A node
whose shared processors are sold out is refused, and the refusal names the
node, what it sells and what the instance asks for.

The back office shows the capacity and the revenue of the platform in
`Pricing → Capacity and revenue`: what every node holds and sells, the
recurring revenue of the running instances, and the margin when the operator
declared what the nodes cost (`capacity.node_costs`). When the cost of a node
was not declared, the margin is unknown and the panel says so, instead of
showing a number that would be made up.

## What the customer sees

The configurator of a product shows the price of the configuration that was
chosen, broken down into the price of the memory, of the processor, of the
storage and of the instance, and the tax that the invoice of the platform
carries. The tax is the rate and the tax identifier the operator wrote in the
settings; a tax without a tax identifier is not added to an invoice, and the
quote says why it is zero.
