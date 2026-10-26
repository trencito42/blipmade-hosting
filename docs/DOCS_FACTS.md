# The facts of the platform, checked on the running system

This is the sheet of facts the documentation is written from. Every line was
checked on the running platform on 2026-10-26, and the place where it was
checked is written next to it. The documentation may only say what is on this
sheet, or what the matrix of the audit (`DOCS_CLAIM_AUDIT.md`) proves.

## What a deployment really is

- A deployment writes a **minimal Node.js HTTP application** into the
  container and starts it with `npm run start`
  (`api/src/services/starter-apps.ts`). It answers on the health path of the
  product and on every other path.
- The container runs the **Node.js egg** of the panel
  (`ghcr.io/ptero-eggs/yolks:nodejs_25`, the egg 15 of the live panel).
- The documentation must therefore **not** say that WordPress, Ghost,
  Forgejo, Grafana, n8n, Uptime Kuma or a database server are installed.
  The product names in the catalog are names of a product of the platform; the
  application that is deployed today is the one above.
- A product of the catalog is deployable only when the row says so. In the
  live database there are five products, and **two of them are deployable**:
  `wordpress` and `discord-bot`. `code-server`, `uptime-kuma` and
  `postgresql` have no egg and are not deployable today.
- A page of an application is published only when the catalog offers it
  (`availablePages()` in `web/src/pages/Docs.tsx`).

## The resources

- The minimum of a product (`minRam`, `minDisk`), the maximum (`maxRam`,
  `maxDisk`) and the price come from the catalog and are shown from it. The
  documentation never writes a price or a minimum of its own.
- The CPU and the memory of an instance are chosen when it is deployed; the
  price of the configuration is calculated by the server (`api/src/services/pricing.ts`).
- The price is in euros and the period is the month (`api/src/services/pricing.ts`).
- A change of resources is an **order that has to be paid**. An increase is
  applied when the order is paid; a decrease is applied at the end of the
  period that was paid. The documentation must not say that a resize is
  immediate, and it must not say that a restart is not needed without saying
  that the service is restarted when it is applied
  (`api/src/services/upgrades.ts`).

## The backups of a customer

- A customer **does** have a backup of the files of the instance: it is made
  by the panel, on demand, from the files of the container
  (`api/src/routes/instance-server.ts`, the tab of the backups in the
  dashboard). It can be downloaded and it can be restored.
- It is **manual**: nothing makes it on a schedule, and the platform does not
  keep a history of it.
- The backup of the **platform** (`scripts/backup.sh`) is something else
  entirely: the database, the configuration and the uploads of the platform,
  for the platform and not for the customer. The documentation of a customer
  never presents it as a backup of the customer; when it is mentioned at all,
  it is to say plainly that it is not a backup of the application.

## The domains and the certificates

- A hostname is proved with a **TXT record** that the platform gives to the
  customer (`api/src/routes/domains.ts`). A hostname that was never proved is
  never routed.
- The routes of the customers are written into the **Caddy of the edge**
  through its administrative API (`api/src/services/gateway.ts`).
- The route that the platform writes **carries no certificate**: it is a
  plain `reverse_proxy`. The edge holds certificates only for its own names
  (`blipmade.com`, `www.blipmade.com`, `test.apps.blipmade.com`).
  So the documentation must not promise an automatic certificate for a
  hostname of a customer. The feature is not available today.
- The domain of the platform is `apps.blipmade.com` (`DOMAIN_BASE`).

## The access to the files and to the console

- The customer reads and writes the files of the instance from the **file
  browser of the dashboard** and sees the output of the service in the
  **console** (`api/src/routes/instance-server.ts`).
- The panel offers an **SFTP** access to the instance
  (`node1.blipmade.com:2022`), but the platform does not surface it and does
  not manage it. The documentation may mention it as an access of the panel,
  and must not present it as a feature of the dashboard.

## The payments

- The environment runs the **sandbox** of Stripe: the key is a key of the
  test mode, and the switch of the payments is off (`PAYMENTS_ENABLED=false`).
- A customer cannot pay today: the checkout is refused
  (`api/src/services/stripe.ts`). The documentation must not promise a
  payment that cannot be made, and it must not promise a refund the platform
  does not implement.
- The chain itself works and is covered: checkout → payment → webhook →
  order paid → subscription → invoice → provisioning → notification
  (`api/tests/stripe-payment-chain.test.ts` and the sandbox
  `api/tests/stripe-sandbox-live.test.ts`).

## The account and the security

- The password of an account has at least ten characters and a complexity
  (`api/src/routes/settings.ts`).
- The sessions last fourteen days and are **not** extended by the activity
  (`api/src/routes/settings.ts`).
- The customer can change the password, see the sessions of the account and
  end them (`api/src/routes/settings.ts`).
- There is **no API of keys**: the programs use the session of an account.
- The roles of the back office are in `api/src/lib/permissions.ts`.

## The suspension and the end of a service

- A service that is cancelled is **kept** for a term of retention (the
  default is thirty days), and the data of the customer is exported before
  anything is deleted (`api/src/services/billing.ts`). The deletion of the
  server happens only when the term is over **and** the operator has allowed
  the automatic deletion.
- The documentation must not say that the data is gone when the period ends.

## The mail

- The mail of the platform is a real **Mailcow** on another machine, with
  three mailboxes of the domain `blipmade.com` and a queue that is empty.
- The hosted mail of the customers exists as a feature
  (`api/src/services/mail*.ts`), but it is **not on sale**
  (`MAIL_SALES_ENABLED` is off). The documentation of the hosted mail must
  say clearly that it is not available today, and it must not describe it as
  something the customer can buy.
- The mail of the platform is the channel of the notifications of the
  customers.

## The status, the incidents and the support

- The dashboard has a page of the status of the platform
  (`/status`) and the back office has a page of the operations
  (`/admin/ops`), with the checks of the machine, of the database, of the
  mail and of the backups.
- An operator can declare an incident (`POST /api/ops/incidents`).
- The customer opens a **support ticket** from the dashboard
  (`api/src/routes/tickets.ts`).

## The limits

- The limits of the platform are in the code and in the settings of the
  back office (`api/src/env.ts`): the size of the request, the rate of the
  addresses, the disk and the memory of the host, the number of the alarms
  of the hour.
- The documentation must not invent a number that the platform does not
  enforce, and must not promise a percentage of availability.

## The rules of the writing

- The name of the product is **Blipmade**. The name of the panel behind it
  (Pterodactyl) never appears in the documentation of a customer.
- Every statement about a feature has to be one of: it is there and it works
  (with the test or the observation that proves it), it is there in the code
  and the customer cannot use it yet (said as such), or it is not there.
- No promise of a percentage of availability, no promise of a refund that the
  platform does not implement, no invented price, no invented limit.
