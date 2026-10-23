# 10 — Launch copy

**Language of this document: English.** It is customer-facing marketing copy. The framing notes around the copy are in English too, so it can be handed to a designer or a copywriter without translation.
**Audit date:** 2026-10-23 · **Audit READ-ONLY.** Nothing here was published, sent or scheduled.

---

## 0. How to use this file

### 0.1 When this copy publishes

**This copy publishes at launch — that is, after the release gate.** The gate is `audit/07-release-gates.md` §3: **NO-GO**, 5 RED gates, 9 conditions that must **all** be met. The copy below is written for the state after those conditions are met, and it is honest for that state. It is **not** honest for today's state, because today the platform cannot take a payment and the containers report `state = None`.

**For the pre-gate period, use only the Discord/community copy** (`audit/10-launch-campaigns.md`, Campania 1), which is written to be safe without payments.

### 0.2 Price used in this copy

**€9.99 per month** for the default configuration (512 MB RAM · 1 vCPU · 5 GB disk) of the `discord-bot` product.

This is the price recommended in `audit/09-pricing-recommendations.md` §2.2 (`baseAmount = 976`), the only price that clears all four cost thresholds: contribution floor €5.67 · 12-month payback floor €7.82 · full-absorption floor €9.60 · 6-month payback floor €9.97.

**Two conditions are attached to this number:**

| # | condition | why |
|---|---|---|
| **D1** | `baseAmount` for `discord-bot` must be set to **976** before publishing | the live catalogue currently shows `149` (`GET /api/catalog/products`) |
| **D3** | the product minimum must be raised to 512 MB / 5 GB, or the 256 MB option removed from the wizard | with `baseAmount = 976` the 256 MB configuration would cost **€9.76 — more than the default**, which is incoherent in "from €9.99" copy (`audit/09-pricing-recommendations.md` §2.3) |

If the launch happens **before** D1 and D3, use **Appendix A** instead. Do not mix the two.

### 0.3 The seven claims this copy never makes

Each is forbidden because a sibling audit file found it to be untrue or unimplemented. None of them may be added back by a copywriter without a new verification.

| never claim | the finding | class |
|---|---|---|
| **"WordPress, PostgreSQL, Uptime Kuma, Code Server"** | 4 of the 5 products have `deployable: false`; the server refuses the order with 400 | `VERIFIED` |
| **"Host game servers"** | no game product exists in the catalogue (`minecraft-paper` is `LAUNCH-AFTER-FIX`), there is **no backup** — and game servers are stateful — and there is **no DDoS protection**, which every documented competitor includes | `VERIFIED` |
| **"Annual billing / pay yearly"** | `YEARLY` has no rows and no code creates it; `renew()` also fabricates `PAID` invoices | `NOT-IMPLEMENTED` |
| **"Free trial / first month free / 50% off"** | no trial, no coupon, no "first period" concept in the promotion model; and the discount does not reach Stripe, which breaks checkout | `NOT-IMPLEMENTED` / `CODE-INSPECTED` |
| **"99.9% uptime" / SLA** | no uptime report exists in the system | `NOT-IMPLEMENTED` |
| **"24/7 support"** | no published response time and no staffed support rotation | `VERIFIED` |
| **"Custom domains included"** | `InstanceDomain` has 0 rows; the Caddy admin API has never been called, so no customer domain has ever been routed | `VERIFIED` |
| **"Trusted by N users" / testimonials / review stars** | 0 subscriptions, 0 invoices, 0 payments have ever existed | `VERIFIED` |

### 0.4 Link targets that actually work

| target | status |
|---|---|
| `/register`, `/login`, `/docs`, `/status` | routes exist and answer `200` |
| `/apps/discord-bot` | route exists; the slug is `discord-bot` in the live catalogue |
| `/#pricing` | ⚠️ **does not scroll.** The router reads the pathname only (`web/src/router.tsx:4,19-20`); a hash is never read on load. Either link to `/` and let the visitor scroll, or ship the one-line hash fix first |
| any external link | **the site has no social links at all** today — `Discord` must be added to the footer (`web/src/home/Rest.tsx:65`) before it can be linked |

---

## 1. Landing page

### 1.1 Hero

**Eyebrow**

```
Managed hosting for Discord bots
```

**H1**

```
Skip the server setup.
```

**Subhead**

```
Blipmade runs your Discord bot on a container you don't have to maintain.
You choose the memory, CPU and disk. You see the price before you pay.
```

**Primary CTA**

```
Start with a Discord bot
```

**Secondary CTA**

```
See the price
```

**Microcopy under the CTA row**

```
Billed monthly. No setup fee. Change the resources any time — you pay the difference.
```

**Price line**

```
€9.99/month for 512 MB RAM, 1 vCPU and 5 GB disk.
```

**Optional status line** *(keep it — it is the brand's "no fake success" rule)*

```
Live platform status: blipmade.com/status
```

### 1.2 Three feature blocks

#### Block 1

```
You choose the resources

Memory, CPU and disk, in the sizes your bot actually needs.
The price is calculated on our side, so the number you see
is the number you pay.
```

Supporting line under the block:

```
256 MB to 4 GB of RAM · 1 to 4 vCPU · 1 to 50 GB of disk.
```

#### Block 2

```
One dashboard

Your files, your usage and your activity in one place.
Start a support ticket from the same page. Nothing to install on your machine.
```

Supporting line:

```
Each customer gets their own credentials. We never hand one person's access to another.
```

#### Block 3

```
Upgrades are priced before they happen

Ask for more memory or more disk and we show you the difference first.
The change applies after the payment, never before.
```

Supporting line:

```
No new server to buy, nothing to migrate.
```

### 1.3 Pricing section

**Eyebrow**

```
Pricing
```

**Heading**

```
Transparent pricing.
```

**Subheading**

```
You pay for the resources you choose. The price is calculated on our side,
so the number you see is the number you pay.
```

**Plan card**

```
Discord Bot
€9.99 /mo

512 MB RAM · 1 vCPU · 5 GB disk
Billed monthly for the resources you pick
Upgrade resources any time
Files, usage and activity included
Support by ticket
```

> **Note for the designer:** the phrase *"Files, logs and domains included"* that appears today in `web/src/home/Rest.tsx:26` must be replaced by the line above. **"domains" is removed on purpose** — no customer domain has ever been routed (`InstanceDomain` = 0 rows, and the Caddy admin API has never been called). *"logs"* was replaced by *"usage and activity"* for the same reason: the console relay and schedules have never been exercised live.

**Second card — only after `wordpress`, `postgresql`, `uptime-kuma` or `code-server` is certified**

```
App Hosting
priced per configuration

The same resources, the same price formula, the same dashboard.
Available for WordPress, Uptime Kuma, Code Server and PostgreSQL.
```

> ⚠️ **Do not publish this card before certification.** The product page for each of those four says, in the live catalogue, *"Its image is not installed on the platform yet, so it cannot be deployed."* A pricing card that lists a service the server refuses to order is the single most expensive mistake in this document.

### 1.4 FAQ

```
What am I billed for?
The memory, CPU and storage you configure, billed monthly. No setup fees.

Can I change the resources later?
Yes. You see the price difference before anything changes, and the change applies after the payment.

How do I cancel?
From the billing page in your dashboard. Your service runs until the end of the paid period.

Is there a yearly plan?
Not yet. Billing is monthly.

What do I get for support?
A ticket from your dashboard. We publish our response times before launch — they are not published here yet, so we are not going to guess.

Can I host a game server?
Not yet. We are not selling game hosting.

Can I point my own domain at my instance?
Not yet. Custom domains are not available at launch.
```

> **The two "not yet" answers are deliberate.** They cost nothing and they remove the two objections that would otherwise arrive as support tickets. A visitor who is told "not yet" once does not file a ticket; a visitor who is told nothing and then hits a 400 does.

### 1.5 Closing CTA

```
Ready when you are

Pick your resources, see the price, and start with a Discord bot.
```

```
Get started
```

---

## 2. Email sequence — 3 emails

> **Precondition:** these emails **cannot be sent until `SMTP_URL` is configured and a verification email and a password-reset email have been delivered**. Today the mail transport is `file`: messages are written to disk with `delivered: false` (`GET /api/health` → `"mail":"file","configured":false`). Do not schedule these before that is proven.
> **Also:** do not include a discount code. See §0.3.

### Email 1 — Confirmation

**Subject**

```
You're in — welcome to Blipmade
```

**Preheader**

```
Your account is ready. Here's what to do next.
```

**Body**

```
Hi <first name>,

Your Blipmade account is ready.

Right now Blipmade hosts one thing: a Discord bot. You choose the memory,
CPU and disk it gets, and you see the price before you pay anything.

Two things worth doing in the next ten minutes:

1. Create your first instance
   Dashboard → Deploy → Discord Bot. The price is on the screen before you confirm.

2. Read the quick start
   blipmade.com/docs has the file you need to run first and the two commands
   that start your bot.

If anything is unclear, reply to this message and a person will answer.

— The Blipmade team
```

**Footer**

```
You're getting this because you created an account at blipmade.com.
Manage what you receive: <unsubscribe link>
```

### Email 2 — Product tour

**Subject**

```
What you can actually do with it
```

**Preheader**

```
Files, usage, upgrades and support — all from one page.
```

**Body**

```
Hi <first name>,

A short tour of the dashboard, so you know what's there before you need it.

Your files
  Every instance has its own file manager. Upload, edit, delete, download.
  Your bot's code and its config live here.

Your usage
  Memory, CPU and disk, measured, in the same panel. This is the number
  you size against.

Your activity
  What the instance did and when — every change, every restart, in order.

Upgrading
  Ask for more memory or disk and you get the price difference first.
  The change applies after you pay, never before.

Support
  A ticket from the same page. Attach a file if it helps.

One thing we should be clear about: we don't publish a response time yet,
and we won't put a number in this email that we can't keep.

— The Blipmade team
```

**Footer**

```
You're getting this because you created an account at blipmade.com.
Manage what you receive: <unsubscribe link>
```

### Email 3 — Launch / opening orders

> **Precondition:** the release gate is met, payments are live, and at least one real order has gone through end to end (order → payment → instance). This email is not a placeholder for that test — it is the send that follows it.

**Subject**

```
Payments are open
```

**Preheader**

```
You can now order a Discord bot on Blipmade.
```

**Body**

```
Hi <first name>,

Payments are open.

You can now order a Discord bot on Blipmade. Choose the memory, CPU and
disk, see the price, and pay. The instance is created for you after the
payment lands, and you get access to its files and usage right away.

€9.99/month for 512 MB RAM, 1 vCPU and 5 GB disk.
You can change the resources at any time — you pay the difference.

The platform still hosts one kind of service: Discord bots. WordPress,
databases, monitoring and game servers are not available yet, and we would
rather tell you that plainly than take your money for them.

If you find a problem with the checkout, the deployment or the dashboard,
reply to this message. It reaches the person who built it.

— The Blipmade team
```

**Footer**

```
You're getting this because you created an account at blipmade.com.
Manage what you receive: <unsubscribe link>
```

---

## 3. Discord announcement

> **Precondition for the Discord server itself:** it does not exist yet, and the site has no social link today. Create the server, add the link to `web/src/home/Rest.tsx:65`, then post this.

**Channel:** `#announcements` · **Pinned** · **Reactions enabled**

```
**Blipmade is open for Discord bots.**

We built a small hosting service for one thing: running a Discord bot
on a container you don't have to maintain.

→ blipmade.com/apps/discord-bot

• You pick the memory, CPU and disk. The price is on the screen before you pay.
• €9.99/month for 512 MB RAM, 1 vCPU, 5 GB disk.
• Your files, your usage and your activity in one dashboard.
• Ask for more resources, see the difference, pay, and it applies.

This is the honest list of what exists today:

• Discord bots — yes, this is what we host.
• WordPress, PostgreSQL, Uptime Kuma, Code Server — not yet. They're in the
  catalogue, they're not deployable yet.
• Game servers — not yet, and we're not going to pretend otherwise.
• Custom domains — not yet.
• Yearly plans — not yet. It's monthly.

If you've been waiting for somewhere to put a bot that isn't your laptop,
this is the thing.

If you try it and it breaks, say so in #ajutor. That's what the channel is for.
```

---

## 4. Launch thread — 6 posts

> **Format:** one post per line, separated by `---`. Written for a platform with a 280-character limit per post. No hashtags, no thread-bait, no engagement bait. Each post is one claim.

**Post 1**

```
We just opened Blipmade — hosting for Discord bots.

Pick memory, CPU and disk. See the price. Pay. It runs.

blipmade.com/apps/discord-bot
```

---

**Post 2**

```
€9.99/month for 512 MB RAM, 1 vCPU and 5 GB disk.

No setup fee. Monthly. Change the resources any time and pay the difference.
```

---

**Post 3**

```
What you get: a file manager, live usage, an activity log, and a support
ticket — on one page, for every instance.

No SSH, no systemd, no "it worked on my machine".
```

---

**Post 4**

```
Upgrades are priced before they happen. You see the difference, you approve
it, it applies after the payment. Never the other way round.
```

---

**Post 5**

```
What we don't have yet, so you're not surprised:

WordPress, PostgreSQL, Uptime Kuma, Code Server — in the catalogue,
not deployable yet.
Game servers — no.
Custom domains — no.
Yearly billing — no.
```

---

**Post 6**

```
We'd rather tell you what's missing than take your money for it.

If you try it and something breaks, say so. That's the useful kind of launch.

blipmade.com
```

---

## Appendix A — Variant for the current price card

> **Use this only if the launch happens before D1 and D3**, i.e. while `baseAmount` is still `149`. Read the warning first.

**⚠️ Warning.** At the current card the platform **loses money on every customer it takes**: at the default €1.72 the contribution is **−€3.83 per customer per month** (`audit/09-unit-economics.md` §3.4), and at €1.49 it is **−€4.05**. Support alone is budgeted at €5.00 per customer per month (`audit/09-unit-economics.md` §3.2) — **more than the entire price**. This copy is publishable; the business behind it is not. `VERIFIED`

**Hero microcopy variant**

```
Apps from €1.49/month.
```

**Plan card variant**

```
Discord Bot
€1.72 /mo

512 MB RAM · 1 vCPU · 5 GB disk
Billed monthly for the resources you pick
Upgrade resources any time
Files, usage and activity included
Support by ticket
```

**Plan card variant, minimum configuration**

```
Starting configuration
€1.49 /mo

256 MB RAM · 1 vCPU · 1 GB disk
```

**What changes in the rest of the copy:** nothing else. The feature blocks, the FAQ, the emails, the Discord post and the thread are **unchanged**, because none of them contain a price or a volume claim.

**What must be added if you publish this variant:** the campaign's budget and the pricing decision become the **first** item on the launch checklist, because every customer signed at this card increases the loss. See `audit/10-marketing-strategy.md` §5.4.

---

## Appendix B — Evidence for every claim in this copy

Every factual assertion in the copy above, with its evidence. If a designer or a copywriter changes a line, the line they change must be re-checked against this table.

| # | claim in the copy | evidence | class |
|---|---|---|---|
| 1 | "runs your Discord bot on a container" | `discord-bot` is the only product with `deployable: true` and egg 15 „node.js generic"; provisioning is proven on real servers | `VERIFIED` (`audit/04-product-certification.md` §3.1, §3.6) |
| 2 | "You choose the memory, CPU and disk" | `Product.minRam/minCpu/minDisk` → `maxRam/maxCpu/maxDisk`; 255 configurations in the deploy wizard | `VERIFIED` (`00-BRIEFING.md` §12.3) |
| 3 | "You see the price before you pay" | the price is quoted server-side and the wizard shows the same figure; 255/255 live quotes match the formula exactly | `VERIFIED` (`audit/05-pricing-consistency.md` §9.1) |
| 4 | "€9.99/month for 512 MB RAM, 1 vCPU and 5 GB disk" | `baseAmount = 976` → 976 + 15 + 0 + 8 = 999 minor = €9.99 | `VERIFIED` (formula, `audit/09-pricing-recommendations.md` §2.3) |
| 5 | "Billed monthly" | `BillingPeriod` = `MONTHLY \| YEARLY`, all rows `MONTHLY`; Stripe session `mode: 'subscription'`, `interval: 'month'` | `VERIFIED` / `CODE-INSPECTED` |
| 6 | "No setup fee" | no setup-fee field, no one-time charge model; `OrderItem.unitAmount` is the recurring line amount | `CODE-INSPECTED` (`audit/05-commerce-and-billing.md` §2.1) |
| 7 | "Change the resources any time — you pay the difference" | a change with `priceDelta > 0` creates an `AWAITING_PAYMENT` order and leaves the instance untouched; the change applies after the payment | `VERIFIED` (`audit/07-release-gates.md` poarta 4 = 🟢 GREEN) |
| 8 | "Your files" | the file routes are exercised; live `GET /api/instances/<id>/files` → 200 with a real file list; 14 tests on the client adapter | `VERIFIED` (`audit/00-current-state.md` §3.3) |
| 9 | "Your usage" | `GET /api/instances/<id>/resources` → 200 live; the client adapter reads resource usage from the panel attributes | `VERIFIED` |
| 10 | "Your activity" | `InstanceEvent` and `AuditLog` are written on every state change; the activity tab reads them | `CODE-INSPECTED` + `VERIFIED` (528 `AuditLog` rows) |
| 11 | "a support ticket from the same page" | 8 ticket routes, 13+9 passing tests, 12 live tickets, attachment upload with a 5 MB limit and an allow-list | `VERIFIED` (`audit/00-current-state.md` §3.6) |
| 12 | "Each customer gets their own credentials" | 3 `PanelCredential` rows, all `source='bridge'`; the global `PTERODACTYL_CLIENT_KEY` is empty; `isolation.test.ts` proves a customer cannot reach another's server | `VERIFIED` (`audit/07-release-gates.md` poarta 1) |
| 13 | "Nothing to install on your machine" | the product is a hosted container; no local agent exists in the product | `CODE-INSPECTED` |
| 14 | "Live platform status: blipmade.com/status" | `GET /api/status` returns 10 measured components; the public page renders it | `VERIFIED` (`audit/00-current-state.md` §3.12) |
| 15 | "the number you see is the number you pay" | the checkout shows the same figure the server charges; gate 10 = 🟢 GREEN | `VERIFIED` |
| 16 | "We publish our response times before launch" | the existing FAQ already says exactly this — the promise is deferred, not made | `CODE-INSPECTED` (`web/src/data.ts:40`) |
| 17 | "Not yet" for WordPress / PostgreSQL / Uptime Kuma / Code Server | the live catalogue's own description says the image is not installed and it cannot be deployed; the server refuses the order with 400 | `VERIFIED` (`audit/04-product-certification.md` §4.3) |
| 18 | "Not yet" for game servers | no game product in the catalogue (`08-product-portfolio.md` §10: `LAUNCH-AFTER-FIX`); no backup, and game servers are stateful (`08-product-portfolio.md` §7); no DDoS protection (`08-competitive-analysis.md` §6.2). **Note:** the ports are *not* the blocker — `provisioning.ts:218` already prefers an allocation in the published `30000+` block, so a game server would be reachable on a non-standard port | `VERIFIED` |
| 19 | "Not yet" for custom domains | `InstanceDomain` = 0 rows; `CADDY_ADMIN_URL` / `CADDY_ADMIN_TOKEN` empty; the Caddy admin API has never been called | `VERIFIED` (`audit/00-current-state.md` §3.4) |
| 20 | "Not yet" for yearly billing | `YEARLY` has no rows and no code creates it | `NOT-IMPLEMENTED` (`audit/05-commerce-and-billing.md` B7) |
| 21 | "It runs" (post 1) | ⚠️ **conditional on release-gate condition 4** — a container that actually runs, verified from the node. Today the panel reports `state = None` on all 5 servers | `VERIFIED` (gate 7) |
| 22 | "live usage" (post 3) | ⚠️ **conditional on gate condition 4** — the client API reports `state: "offline"`, `uptime: 0`, `memory_bytes: 0` for the instance marked `ONLINE` in the database | `VERIFIED` (gate 12) |
| 23 | "Start with a Discord bot" → `/register` | the route exists and answers 200; `POST /auth/register` creates the account and login does not require a verified address | `VERIFIED` (live) + `CODE-INSPECTED` |
| 24 | "blipmade.com/docs has the file you need to run first" | the docs page for `discord-bot` exists inside the SPA bundle (`web/src/pages/Docs.tsx:2259`) | `VERIFIED` (live: `/docs` → 200) |
| 25 | "reply to this message and a person will answer" | ⚠️ **conditional**: this requires a monitored reply address. The mail transport must be `SMTP_URL`-backed, and the promise of a human answer must be one the operator can keep. If it cannot be kept, replace with: "reply to this message — it reaches the team inbox." | `CODE-INSPECTED` |

---

## Appendix C — Notes for whoever implements this copy

| # | task | where | effort |
|---|---|---|---|
| 1 | set `baseAmount = 976` for `discord-bot` | admin → pricing screen (`api/src/routes/admin.ts:537-556`) | 2 min |
| 2 | raise the product minimum to 512 MB / 5 GB, or remove 256 MB from the wizard | product configuration + `api/src/services/pricing.ts` minimum handling | 1–2 h |
| 3 | replace the hero price line and the pricing card | `web/src/home/Hero.tsx:65`, `web/src/home/Rest.tsx:23-28` and `:31-33` | 1 h |
| 4 | replace *"Files, logs and domains included"* | `web/src/home/Rest.tsx:26` | 10 min |
| 5 | replace the homepage FAQ with the one in §1.4 | `web/src/data.ts:35-41` | 20 min |
| 6 | remove the "Founding users offer — 50% off" block, or mark it *"no campaign is running"* | `web/src/home/Catalog.tsx:202-213` | 10 min |
| 7 | add the Discord link to the footer | `web/src/home/Rest.tsx:65` | 10 min |
| 8 | add a per-route `<title>` so the landing page is not titled identically to every other route | `web/src/routes.tsx:56,256` — set `document.title` from `route.title` | 1 h |
| 9 | fix the `#pricing` deep link, or link to `/` instead | `web/src/router.tsx:4` and `:21-23` | 30 min |
| 10 | add an `og:image` and OG/Twitter tags before the post in §4 is shared | `web/index.html` | 2 h |
| 11 | set up the unsubscribe mechanism for the email footer | **does not exist** — needs building before emails are sent | 4–6 h |

> **Ordering:** items 1 and 2 must land before anything in §1 or §2 goes out, or the copy will contradict the catalogue. Items 6 and 7 must land before the Discord announcement is posted. Item 11 must land before the email sequence is scheduled.
