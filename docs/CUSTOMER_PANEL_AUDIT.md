# Customer panel audit

The state of the customer panel of Blipmade, the problems that were found, what
was done about them and what is left for the operator.

- **Scope**: the customer area (`/app/*`), the public pages of the site, the
  authentication pages, the API behind them and the transactional mail.
- **Environment**: the deployment on `10.77.0.13` (`/opt/blipmade`), the
  public domain `https://blipmade.com` through the gateway on `10.77.0.12`,
  the panel on `10.77.0.10`.
- **Data**: nothing was deleted. Every user, instance, allocation, subscription
  and database of the platform is as it was. The only change to the database is
  the addition of two tables and two columns, which hold new information and
  touch no existing row.

---

## 1. The routing of the session

### 1.1 A customer who is signed in still saw the login form

**What it was.** `/login` and `/register` had no guard. A customer who was
already signed in could open them, fill the form and sign in again. The page
also showed the form for a moment while the session was being read, so the
form appeared and disappeared.

**Cause.** `web/src/routes.tsx` had a `Guard` for the areas that need a
session, but nothing for the two routes that need the opposite. The `Guard`
itself called `navigate()` during the render, which is a side effect in a
render: it runs twice under StrictMode and leaves a blank page behind while
the redirect is on its way.

**What was done.**

- `web/src/auth-guard.ts` (new): the rules of the routing, as pure functions.
  `isInternalPath`, `normalizePath`, `authorizedNext`, `postLoginTarget`,
  `homeOf`, `loginRedirect`.
- `web/src/routes.tsx`: a `GuestOnly` guard for `/login` and `/register`. It
  reads the session **once**. If there is a session at that moment, the
  visitor is sent to the page of their role. A session that appears later
  comes from an action on the page itself, and the page decides where it goes
  — that is what keeps the "check your email" screen of the register form
  from being taken away.
- The `Guard` of the protected areas now redirects in an effect and shows a
  loading block while it does, so the page is never shown without a session.
- The `next` value is only honoured when it is a path of this site that the
  role may open. A customer cannot be sent to `/admin`, a guest route cannot
  be a destination (that would loop), and `/app/../admin/orders` is resolved
  before it is checked.
- The session that ends while the page is open is noticed: `lib/api.ts` reports
  a `401` that is not an answer, `session.tsx` clears the session, and the
  guard sends the visitor to the login with the page they wanted.
- `web/src/home/Nav.tsx` and `web/src/home/Rest.tsx`: the public navigation
  shows **Dashboard** instead of **Log in** when there is a session.

**Tests.** `web/tests/auth-guard.test.ts` — 8 checks: the internal paths, the
normalisation of `..`, the areas of the roles, the destinations that would
loop, the other sites, the landing page of each role and the redirect of the
login. Run by `scripts/run-tests.sh` with the test runner of Node.

**Evidence.** `scripts/ops/browser-customer-panel.mjs`, section 1 and 2:
a customer route without a session sends to `/login?next=%2Fapp/instances`,
the form is shown to a visitor without a session, the account flows stay
reachable, a customer with a session is sent away from `/login` and
`/register`, and the public navigation shows the dashboard.

### 1.2 The back button and the refresh

The redirects use `replace`, so the back button does not return to a page that
needs a session. The `next` value keeps the query of the page that was asked
for, so a filter or a step of a wizard is not lost.

---

## 2. The typeface of the interface

### 2.1 proxima nova never reached the browser

**What it was.** The interface asks for `Proxima Nova` and falls through to
Geist. The typeface was supposed to arrive through the Adobe Fonts web
project of the account, and the kit was never given to the server.

**Cause.** The typeface was bound to an address of a third party, so it could
only be used with an account of Adobe. The desktop files of Adobe are not
licensed for the web and are not part of this project, so they could not be
used either.

**What was done.** The typeface is now served from this machine.

- `web/fonts.mjs` (new): the three web files of proxima nova are named, and
  the site reports which of them are missing.
- `web/src/index.css` declares the three faces itself, with the paths under
  `/fonts/`. The browser asks this site for the files and not a third party.
- `web/server.mjs` serves the files with `font/woff2` and an `ETag`, and
  `/healthz` answers with the state of the typeface.
- The Adobe kit is gone: `web/fontkit.mjs`, `ADOBE_FONTS_KIT_URL`,
  `ADOBE_FONTS_FAMILY` and the injection of the kit into the page are removed.
- Geist stays the fallback, and Geist Mono stays the typeface of the technical
  values.
- `docs/TYPOGRAPHY.md` has the step for the operator, the line to put in the
  `.env`, the three lines the server prints and the check in the browser.

**Tests.** `web/tests/fontkit.test.mjs` — 5 checks: the hosts that are
accepted, the names that are read out of a stylesheet, the order of the stack,
the rule of the typeface and the name the operator writes down.

**What is left for the operator.** The kit itself. The environment of the
running container was read without touching any other secret:

```
$ docker inspect blipmade-web-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -i adobe
(no output)
```

Without the kit, the interface stays on Geist. That is the state of the
deployment today, and it is deliberate: the typeface was never there.

**What could not be verified.** There is no Safari and no WebKit build in this
environment (`/usr/bin/chromium` is the only engine). The typography was
verified in Chromium: the faces that are loaded, the computed `font-family`
and the absence of any request to Adobe while no kit is configured. The
verification in a clean Safari session is still to be done by a person.

---

## 3. The catalog and the prices

### 3.1 `/app/deploy` sent the customer to one product

**What it was.** The route `/app/deploy` did not exist. The link "Deploy new"
on the page of the services pointed at the public catalog, and the empty state
of the overview offered one product of the catalog by name, so the product was
picked for the customer.

**What was done.**

- `web/src/app/DeployCatalog.tsx` (new): the selector of the customer area.
  The list is the real catalog, read from `GET /api/catalog/products`, with a
  search, the categories that really exist, the smallest configuration of each
  product and its price. A product that is listed but not validated for
  deployment is shown with the state it has — **Coming soon** — and cannot be
  ordered; a product without a price is shown as **Not priced yet**.
- The route `/app/deploy` was added, and the wizard `/app/deploy/:slug` stays.
- The navigation of the customer area has a **Deploy** entry, and the bar of
  the customer area has a **Deploy** action on every page, so the way to the
  catalog is one press away on a phone as well.
- The empty state of the overview, the empty state of the services and the
  shortcut of the overview all point at the selector.

### 3.2 Two prices for the same product

**What it was.** The marketing pages showed "from €1.49" while the wizard
showed €1.72 for the default configuration. Both numbers were right, and
together they looked like a mistake.

**Cause.** The first is the price of the smallest configuration, the second is
the price of the configuration the wizard starts with. Nothing said so.

**What was done.** The price of the smallest configuration is labelled
**Starting price** on the cards of the catalog and **The price of the smallest
configuration is …** in the estimate of the wizard, next to the price of the
configuration that was chosen. Every price comes from the server: the cards
from the catalog, the estimate from `POST /api/catalog/quote`, which is
recomputed on every change. The client never computes a price.

---

## 4. The support tickets

### 4.1 A ticket could not be opened

**What it was.** Opening a ticket failed. The API wanted `TECHNICAL`,
`NORMAL`, `OPEN` in upper case and the web sent `normal` in lower case.

**Cause.** The API read the values in one case and wrote them in another: the
answer used `.toLowerCase()` while the schema wanted the upper case of the
Prisma enumeration.

**What was done.**

- `api/src/routes/tickets.ts`: the values are read in any case and with
  spaces, and the answer uses **one** shape — the upper case of the Prisma
  enumeration. The normalisation is in one place.
- A field that is wrong is now named: the answer carries the field and the
  values that are allowed, so the problem is shown next to the input instead
  of a generic message.
- The web keeps sending lower case, and the web reads the upper case without
  a change: the label of the category is found in the list of the categories
  and the label of the status has its own map.

**Tests.** `api/tests/tickets-create.test.ts` — the values in any case, the
shape of the answer, the error that names the field.

---

## 5. The checkout

### 5.1 The customer was sent to `127.0.0.1`

**What it was.** Pressing "Pay" sent the customer to
`http://127.0.0.1:3000`, the loopback address of the server.

**Cause.** `api/src/services/stripe.ts` built the `success_url`, the
`cancel_url` and the `return_url` from `APP_PUBLIC_URL`, which was
`http://127.0.0.1:3000` in the deployment.

**What was done.**

- Every address a customer follows is built from `PUBLIC_WEB_URL`, the
  canonical origin of the site (`https://blipmade.com`). A private or a
  loopback address is never used, and an empty origin is an error instead of
  a broken link.
- The deployment has `PUBLIC_WEB_URL=https://blipmade.com` and
  `APP_PUBLIC_URL=https://blipmade.com`.
- `PAYMENTS_ENABLED` is `false` in the deployment, so a checkout answers that
  the payments are not available: **no Stripe session is created, no URL is
  invented and no payment is pretended**. The order is only ever marked as
  paid by a webhook that was verified.

**Tests.** `api/tests/stripe-origin.test.ts`.

### 5.2 The webhook of the payments accepted an event without a signature

**What it was.** The deployment had `STRIPE_TEST_MODE=true` and no Stripe key.
With that combination the local test gateway stood in for Stripe, and the
webhook of the payments accepted **any** JSON body: the signature was only
checked when a live key was configured.

**Why it matters.** `POST /api/webhooks/stripe` marks an order as paid, and an
order that is paid starts the provisioning of a service. With the gateway on,
anyone could have sent a made-up `invoice.paid` event to the live site and had
a service created without paying for it.

**What was done.**

- `api/src/services/stripe.ts`: the local gateway is **never** used when
  `NODE_ENV=production`. The rule is written in the code and not only in the
  deployment, so a new environment cannot turn it on by accident.
- The deployment has `STRIPE_TEST_MODE=false` and `PAYMENTS_ENABLED=false`.
- The webhook now refuses everything while no Stripe key is configured:

  ```json
  { "received": false, "reason": "Stripe is not configured." }
  ```

**Evidence.** `scripts/ops/browser-customer-panel.mjs`, section 7: a made-up
event is sent to the webhook of the public domain and it is refused.

---

## 6. The settings of the account

**What it was.** The page of the settings was a set of panels that said the
feature was not available.

**What was done.** `api/src/routes/settings.ts` (new) and
`web/src/app/Settings.tsx` (rewritten):

| Area | What works now |
|---|---|
| Profile | The first name and the last name are edited and saved. |
| Email | A new address is only used after **it** has answered. The address of the account stays the old one until then, so a mistyped address cannot lock a customer out. |
| Password | The current password is needed, the new password is checked against the rules, and the other sessions of the account end. The device that changed it stays signed in. |
| Sessions | Every device that is signed in, with the address and the moment it was opened. A session is closed one by one, and the current one can be closed too. |
| Notifications | Five preferences, kept with the account. They say what the customer wants to hear about; they never promise that a message was sent. |
| Account | The closing of the account is a **request**, not a deletion: the password is needed and the words have to be typed, the request is written down and can be taken back. The services keep running until the end of the paid period. |

**The API keys are deliberately not offered.** A key that authenticates a
public API of the customer does not exist yet: the API of the platform is the
API of the panel. An interface that would create a key that grants nothing
would be a lie, so there is no such panel. The blocker is written down in
`docs/CUSTOMER_PANEL_COMPLETION.md`.

**Tests.** `api/tests/settings.test.ts` — 11 checks, including that the
address of the account does not change before the confirmation, that the
sessions of another account cannot be closed, that the password needs the
current one and that the closing of the account deletes nothing.

---

## 7. The transactional mail

**What it was.** Nodemailer with an empty `SMTP_URL`, a file transport, three
text templates and nothing that told the truth about the delivery. The links
of the verification and of the reset were built from `APP_PUBLIC_URL`, so they
pointed at the loopback address of the server. The token of the verification
was written in the log of the container.

**What was done.**

- `api/src/lib/email-templates.ts` (new): branded templates in HTML and in
  plain text for the verification, the reset, the change of the address, the
  tickets, the invoices and the notifications of the services. The brand is the
  one of the site: near black, green, flat surfaces, rounded corners and a
  font stack that works in a mail client.
- Every link is built by `publicLink()` from the canonical origin. There is
  one place that builds a link, so the address in the message and the address
  in the link cannot drift apart.
- The state of a delivery is explicit: `queued`, `delivered`,
  `written-to-file` or `failed`. **The answer never says that a message was
  sent while the file transport is active**: it says that the delivery is not
  configured and that support has to finish the flow. The answer is the same
  for an address that has an account and for one that has not, so it never
  tells whether an account exists.
- The messages go through the queue of the platform, with a bounded number of
  attempts, a backoff and a key that makes a retry send the message only once.
- The state of the messages is kept in the table `MailDelivery` and is
  readable by the staff at `GET /api/admin/email/delivery` and in the health
  endpoint. The row holds the state and never the body and never a token.
- **A token is never written in a log.** The verification and the reset write
  a reference (the first characters of a hash) instead of the token, and the
  file that is written to disk has the link removed, so it cannot be replayed.
- `docs/EMAIL.md`: the step for Brevo and for Resend, the format of
  `SMTP_URL`, the sender identity under `blipmade.com`, the records of
  SPF, DKIM and DMARC **as additions**, with the warning that the **MX record
  of the domain must be preserved** — both providers need it, and replacing it
  would break the mail that exists today — and the checklist of the
  verification.

**Tests.** `api/tests/email-templates.test.ts` and
`api/tests/email-delivery.test.ts` — the shape of the templates, the origin
of every link, the state of the file transport, the answer that does not
claim a delivery, and the absence of the token in the logs and in the files.

**What is left for the operator.** The relay itself and the records of DNS.
Without `SMTP_URL` the mail is written to a file and nobody receives it. A
real delivery test is only possible once the operator has chosen the provider
(Brevo or Resend) and configured the account.

---

## 8. The phone

The whole experience of the customer was looked at on the widths 320, 360,
375, 390 and 430 pixels, route by route: the overview and its empty states,
the services and the catalog, the wizard of the deploy (the configuration, the
resources, the review, the promotion code, the payment and the provisioning),
the billing, the support (a new ticket, the dropdowns, the priority, the
validation and the conversation), the settings, the navigation of the customer
and of the staff, the safe areas, the software keyboard, the focus, the
scrolling and the touch targets.

The desktop layout and the identity of the site are unchanged. The rules that
were applied are listed in `docs/CUSTOMER_PANEL_COMPLETION.md`, section 6,
together with the result of the measurement of every route on every width.

### 8.1 What the measurement found

The measurement was made with a real browser on the public domain, on the nine
routes of the customer and on the five widths. It looked at two things: whether
the page can be scrolled sideways, and whether every control that is pressed
with a finger is big enough.

| What was found | Where | What was done |
|---|---|---|
| A card whose text is cut off asked the page to be wider than the screen: the width of the whole text was asked for, because a cut text is one long word. | The tickets of the customer, the list of the apps on the home page | The card that holds the text can shrink (`min-w-0`, `w-0`), and the grid that holds it has a track that can shrink (`minmax(0,1fr)`). The text is now cut off inside the card, as it should be. |
| The panel of the hero was turned in depth on a phone, and a picture that is turned reaches past the edges of the screen. | The home page | The turn is only used on a wide screen. On a phone the panel stands straight. |
| The links of the footer were 21 pixels tall. | The home page | They keep the height of a touch target (44 pixels). |
| The form of a new ticket was a sheet pinned to the bottom of the screen; the keyboard of the software covered it and the field that was being written into could not be reached. | The support | The form is in the flow of the page. It takes the focus when it opens, it gives it back when it closes, and Escape closes it. |
| The priority was a dropdown on a phone. | The support | It is a strip of three choices, which is easier to hit with a finger. |
| The bar of the deploy wizard was pinned to the bottom of the screen, over the keyboard and over the promotion code. | The deploy | The bar is in the flow of the page, with the price next to the action. |
| The text of a field was 15 pixels, so the browser zoomed the page when the field was focused. | Every form | The text of a field is 16 pixels on a phone. |
| A long subject was cut to a few letters to make room for the pill of the state. | The list of the tickets | The pill gets a line of its own. |
| The records of DNS became a list of pairs of text on a phone. | The domains | They are cards below 768 pixels. |

### 8.2 What could not be verified

There is no real phone and no Safari in this environment. The measurement was
made with Chromium at the five widths, and the captures are in
`screenshots/panel` on the host. A person has to look at the captures on a
device before the panel is called finished on a phone.

---

## 9. What is still open

| # | What | Who | Why it is still open |
|---|---|---|---|
| 1 | The Adobe Fonts web project | operator | The kit of the account is needed. The step is in `docs/TYPOGRAPHY.md`. |
| 2 | The mail relay | operator | `SMTP_URL` and the records of DNS. The step is in `docs/EMAIL.md`. |
| 3 | The payments | operator | `PAYMENTS_ENABLED` is `false` and `STRIPE_SECRET_KEY` is empty in the deployment. The answer is honest: the payments are not available. |
| 4 | The keys of the API of the customer | product | The public API of the customer does not exist. The interface does not offer a key that grants nothing. |
| 5 | The closing of an account | staff | The request is written down. The deletion itself is a decision of a person, and it is not done by the platform. |
| 6 | The name on the panel | platform | The name of the customer is changed on Blipmade. The account of the panel keeps the old name until the next time the identity is reconciled. |
| 7 | Safari and a real device | a person | Neither exists in this environment. |

---

## 10. The data

Nothing was deleted. The migrations of this round only add:

- `User.deletionRequestedAt` — the moment a customer asked for the closing.
- `EmailChangeRequest` — a change of the address that waits for its answer.
- `NotificationPreference` — what a customer wants to hear about.
- `MailDelivery` — the state of a message.

No existing row was changed, and no user, instance, allocation, subscription or
database of the platform was touched. The tests of the suite run against the
separate database `blipmade_test`.
