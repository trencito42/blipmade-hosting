# Customer panel completion

What is done, what is checked, what is waiting and what is left. One line per
route, one line per requirement.

The companion document is `docs/CUSTOMER_PANEL_AUDIT.md`: it holds the
problems, the cause of each one, the files that were changed and the tests
that were added.

---

## 1. The state of the platform

| | |
|---|---|
| Deployment | `10.77.0.13` (`/opt/blipmade`), containers `api`, `worker`, `web` |
| Public domain | `https://blipmade.com`, through the gateway on `10.77.0.12` |
| Tests of the API | **219 passed** (22 files) against `blipmade_test` |
| Tests of the web | **13 passed** (`web/tests`, the runner of Node) |
| The check in a browser | **134 checks passed, 0 problems** (`scripts/ops/browser-customer-panel.mjs`, on the public domain, Chromium) |
| Type check | `api`: `tsconfig.json` and `tsconfig.test.json` clean. `web`: `tsconfig.json` clean |
| The data | nothing was deleted; two tables and two columns were added |
| The mail | the file transport: a message is written to disk and nobody receives it |
| The payments | `PAYMENTS_ENABLED=false` and `STRIPE_SECRET_KEY` is empty: a checkout says that the payments are not available |
| The typeface | Geist, because the web project of Adobe is not configured |

---

## 2. The routes of the customer area

| Route | What it does now | Checked |
|---|---|---|
| `/login` | The form of a visitor without a session. A customer with a session is sent to their area. The `next` is only used when it is a destination of their role. | browser + `web/tests/auth-guard.test.ts` |
| `/register` | The form of a visitor without a session. After the account is created the screen of the confirmation stays, with the honest answer of the API. | browser |
| `/forgot-password` | Reachable for everybody. The answer never says that a message was sent while the relay is not configured. | browser + `api/tests/auth.test.ts` |
| `/reset-password` | Reachable for everybody, also with a session. | browser |
| `/verify-email` | Reachable for everybody, also with a session. | browser |
| `/` | The public page. The navigation shows **Dashboard** when there is a session. | browser |
| `/apps`, `/apps/:slug` | The public catalog. The link of the deploy sends the visitor to the login with the product in the `next`. | browser |
| `/app` | The overview. The empty state offers the catalog, not a product that was picked. | browser, 5 widths |
| `/app/instances` | The services and the databases. "Deploy new" opens the selector of the products. | browser, 5 widths |
| `/app/instances/:id` | The detail of a service: the console, the files, the databases, the activity, the schedules. | browser, 5 widths |
| `/app/deploy` | **The selector of the products**, over the real catalog: the categories, the smallest configuration, the price, the state of every product. | browser, 5 widths |
| `/app/deploy/:slug` | The wizard: the configuration, the resources, the review, the promotion code, the payment and the provisioning. | browser, 5 widths |
| `/app/domains` | The domains of the account. | browser, 5 widths |
| `/app/billing` | The invoices, the subscriptions and the payment methods. The checkout says what the state of the payments is. | browser, 5 widths |
| `/app/tickets` | The tickets of the customer. A ticket can be opened: the values are read in any case and a field that is wrong is named. | browser + `api/tests/tickets-create.test.ts` |
| `/app/tickets/:id` | The conversation of a ticket. | browser, 5 widths |
| `/app/settings` | **Profile, email, password, sessions, notifications and the closing of the account.** No panel says that a feature is not available. | browser + `api/tests/settings.test.ts` |
| `/admin/*` | The area of the staff. A customer who opens it is told that it is for the staff, and is not sent in a circle. | browser |

---

## 3. The five requirements of the round

### 3.1 The guest-only guard

| What was asked | Where it is | State |
|---|---|---|
| A reusable guard for `/login` and `/register` | `web/src/auth-guard.ts`, `web/src/routes.tsx` | done |
| A customer with a session goes to `/app` | `postLoginTarget()` | done |
| A staff member with a session goes to `/admin` | `homeOf()`, `isStaff()` | done |
| The form is never shown while the session is being read | `GuestOnly` | done |
| A `next` that is valid is kept, only when it is allowed | `authorizedNext()` | done |
| No redirect in a circle, no open redirect, no flash | `normalizePath()`, `authorizedNext()`, the effect of the `Guard` | done |
| The back button, the refresh, the end of the session, the logout | `replace` on the redirects, the `401` that clears the session | done |
| The verification and the reset stay reachable | `ACCOUNT_ROUTES` | done |
| The public navigation shows the dashboard | `web/src/home/Nav.tsx`, `web/src/home/Rest.tsx` | done |
| Tests of regression | `web/tests/auth-guard.test.ts` (8) | done |

### 3.2 proxima nova

| What was asked | Where it is | State |
|---|---|---|
| The configuration of the running container was read | `/healthz` answers with the state of the typeface | done |
| The typeface is served from this machine | `web/fonts.mjs`, `web/src/index.css`, `web/server.mjs` | done |
| The licensed web files of proxima nova 400/600/700 | three woff2 files under `web/public/fonts/` | **waiting for the operator** |
| No desktop `.otf` of Adobe | nothing of the kind is in this project | done |
| Geist stays the fallback | `--font-sans` keeps Geist behind proxima nova | done |
| The exact step of the operator | `docs/TYPOGRAPHY.md`, section 5 | done |
| The requests of the files and the faces that are loaded | `scripts/ops/browser-mobile-real.mjs` and `scripts/ops/browser-overflow-source.mjs` | done in Chromium |
| The typography in a clean Safari session | — | **not possible here**: there is no Safari and no WebKit in this environment |

### 3.3 The phone

| What was asked | State |
|---|---|
| 320, 360, 375, 390 and 430 pixels | every route of the customer area was measured on the five widths |
| The overview and the empty states | the order of the information was rewritten, one action per empty state |
| The services and the catalog | the cards of the products, the filters, the price line |
| The wizard of the deploy | the configuration, the resources, the review, the promotion, the payment, the provisioning |
| The billing | the invoices, the subscriptions, the payment methods |
| The support | the new ticket, the dropdowns, the priority, the validation, the conversation |
| The settings | the profile, the security, the sessions |
| The navigation of the customer and of the staff | the bar of the bottom, the sheet of "more", the action of the bar |
| The safe areas, the keyboard, the focus, the scrolling, the touch targets | see section 6 |
| The desktop and the identity of the site | unchanged: the same tokens, the same components, no new dependency |
| The captures | `screenshots/` on the host, in the report of the browser check |

### 3.4 The mail

| What was asked | Where it is | State |
|---|---|---|
| No mail server of our own | Nodemailer with `SMTP_URL` | done |
| Ready for Brevo or Resend | `docs/EMAIL.md`, section 3 | done |
| A sender under `blipmade.com` | `MAIL_FROM` | **waiting for the operator**: the address has to be verified by the provider |
| Templates in HTML and in plain text | `api/src/lib/email-templates.ts` | done |
| Every link on `https://blipmade.com` | `publicLink()` | done |
| "Sent" is never said while the transport is a file | the state of the delivery | done |
| Retry, queue and the state of the delivery | the queue of the platform, the table `MailDelivery` | done |
| The tokens are never logged | the reference of the token, the redaction | done |
| SPF, DKIM and DMARC without touching the MX | `docs/EMAIL.md`, section 5 | done |
| A real delivery test | — | **waiting for the operator**: impossible without `SMTP_URL` |
| No credential in a commit or in a log | no secret in this repository | done |

### 3.5 The verification

| What was asked | State |
|---|---|
| The audit and the completion reports | this document and `docs/CUSTOMER_PANEL_AUDIT.md` |
| The routing with and without a session | the browser check, sections 1 and 2 |
| The typefaces | the browser check, section 7 |
| The usability on a phone | the browser check, section 8 |
| The state of the mail | the browser check and the API tests |
| The support tickets | the browser check opens a ticket, the API tests cover the values |
| The redirect of the checkout on the public domain | the browser check, section 6 |
| The data are kept | nothing was deleted; the migrations only add |
| The platform is not called ready while a critical flow is not checked | see section 7 |

---

## 4. The API that was added

| Route | What it does |
|---|---|
| `GET /api/settings` | Everything the page needs, in one answer. |
| `PATCH /api/settings/profile` | The first name and the last name. |
| `POST /api/settings/email` | Sends the confirmation to the new address. The address of the account does not change yet. |
| `POST /api/settings/email/confirm` | The new address is used. |
| `POST /api/settings/password` | Needs the current password; the other sessions end. |
| `GET /api/settings/sessions` | The devices that are signed in. |
| `DELETE /api/settings/sessions/:id` | One session is closed. |
| `GET /api/settings/notifications` | The preferences. |
| `PUT /api/settings/notifications` | The preferences are saved. |
| `POST /api/settings/account/closure` | The request of the closing. Nothing is deleted. |
| `DELETE /api/settings/account/closure` | The request is taken back. |
| `GET /api/admin/email/delivery` | The state of the messages, for the staff. |
| `GET /api/health` | Carries the state of the mail and the summary of the deliveries. |

---

## 5. The tables that were added

| Table | What it holds |
|---|---|
| `EmailChangeRequest` | A change of the address that waits for its answer. The token is never stored, only its hash. |
| `NotificationPreference` | What a customer wants to hear about. |
| `MailDelivery` | The state of a message: the state, the attempts, the last error. Never the body and never a token. |
| `User.deletionRequestedAt` | The moment a customer asked for the closing of the account. |

---

## 6. The rules of the phone

The rules that were applied to every page of the customer and of the staff:

1. **The width.** No page is wider than the screen at 320 pixels. A row that is
   allowed to scroll sideways (the chips of a filter, the steps of the wizard,
   a wide table) scrolls inside its own box and never pushes the page.
2. **The touch targets.** Every control that is pressed with a finger is at
   least 40 pixels tall and 28 pixels wide; the buttons of the actions are 44
   pixels (`h-11`) and the fields are 56 pixels (`h-14`).
3. **The keyboard of the software.** The text of a field is 16 pixels on a
   phone, so the browser does not zoom the page when the field is focused. The
   bar of the bottom hides itself while the keyboard is open, and nothing is
   fixed at the bottom of the page, so the field that is being written stays
   visible.
4. **The focus.** A sheet, a menu or a dialog takes the focus when it opens
   and gives it back when it closes. Escape closes it. The order of the tab
   follows the order of the reading.
5. **The scrolling.** A sticky bar reserves the room of the first row. The
   content reserves the room of the bar of the bottom and the safe area of the
   home indicator.
6. **The tables.** The pattern of the codebase is kept: a table on a desktop,
   the same rows as cards on a phone.
7. **The rhythm.** The panels of a phone are `p-4`, the gaps are `gap-3` and
   `gap-4`. An empty state is one line of what is missing, one action and the
   facts that help — not three paragraphs in a row.
8. **The identity.** The same tokens, the same components, the same colours.
   No oversized cards and no second visual language.

---

## 7. What is left

### 7.1 Waiting for the operator

| What | The step | What it unblocks |
|---|---|---|
| The web project of Adobe | `docs/TYPOGRAPHY.md`, section 6 | proxima nova reaches the browser |
| The relay of the mail | `docs/EMAIL.md`, section 3 | the mail is really delivered |
| The records of DNS | `docs/EMAIL.md`, section 5 | the mail is not refused by the receivers |
| The keys of Stripe | `PAYMENTS_ENABLED=true` and the key of the account | the checkout works |
| The address of the sender | `MAIL_FROM` under `blipmade.com`, verified by the provider | the mail is not refused |

### 7.2 Deliberately not turned on

| What | Why |
|---|---|
| The keys of the API of the customer | The public API of the customer does not exist. A key that grants nothing would be a lie, so the interface does not offer one. |
| The deletion of an account by the customer | The request is written down; the deletion is a decision of a person. The services keep running until the end of the paid period. |
| The payments of the platform | `PAYMENTS_ENABLED=false` and `STRIPE_SECRET_KEY` is empty: a checkout answers `503 payments_unavailable` |
| The local test gateway of Stripe | it stands in for Stripe only while the tests and a local installation run. A deployment with `NODE_ENV=production` never uses it, so the webhook of the payments refuses every event that has no signature. |

### 7.3 Not possible in this environment

| What | Why |
|---|---|
| Safari | There is no Safari and no build of WebKit here. Chromium was used. |
| A real device | There is no phone here. The widths were measured in the browser, not seen on a device. |
| The delivery of a mail | There is no relay. The transport of a file is what the environment has. |
| The payment of a real order | The key of Stripe is in test mode and the payments are off. |

---

## 8. The verdict

The panel is **not** called production ready. The reason is not a defect of the
code: it is that the three things that need an account of the operator — the
typeface, the mail and the payments — cannot be checked from here, and a
critical flow that was not checked is not a flow that works.

What **is** checked, on the public domain and with a real browser, by
`scripts/ops/browser-customer-panel.mjs` (134 checks, 0 problems):

| What | The result |
|---|---|
| A route that needs a session, without one | it sends to `/login?next=…` and keeps the page that was asked for |
| `/login` and `/register` with a session | the visitor is sent to their area; the form is never shown |
| The area of the staff, seen by a customer | it says that it is for the staff; there is no circle |
| The account flows | `/forgot-password`, `/reset-password` and `/verify-email` stay reachable |
| The public navigation | **Log in** without a session, **Dashboard** with one |
| `next` = another site | the customer lands on `/app`, on the same origin |
| `next` = `/admin/orders` | a customer lands on `/app` |
| `next` = `/login` | the customer lands on `/app`; there is no circle |
| The settings | the profile, the sessions and the preferences are there; the name is really saved |
| A support ticket | it is opened, it is in the list and it opens its own message |
| The checkout | it answers `503 payments_unavailable` ("no Stripe key is configured on this environment"); no URL is invented and no local address appears |
| The webhook of the payments | an event without a signature is refused: `{"received": false, "reason": "Stripe is not configured."}` |
| The typefaces | 11 faces are loaded, the interface asks for proxima nova and then for Geist, the technical values use Geist Mono, and nothing is asked from Adobe while no kit is configured |
| Every route on 320, 360, 375, 390 and 430 pixels | no page can be scrolled sideways and every control is big enough to be pressed with a finger |

When the operator has configured the web project of Adobe, the relay of the
mail and the keys of Stripe, the three checks that are missing here have to be
run again — the verification in Safari, a real delivery of a message and a
payment that ends in a verified webhook. The steps are in
`docs/RUNBOOK.md` and in `docs/EMAIL.md`.
