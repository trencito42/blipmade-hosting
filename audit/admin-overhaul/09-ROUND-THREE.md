# 09 · Round three

**Date:** 2026-11-02 · **Branch:** `feat/admin-overhaul`

What was added after report 08, what was tried, and what was found.

## Built
| Item | What it does | Where |
|---|---|---|
| Yearly discount | A setting `pricing.yearly_discount_percent` (whole number, 0 to 50, default 0 = none). It lowers the resources of a game server when the customer pays for a year. It never touches add-ons, a monthly term, a mail plan or a VPS plan. A value outside 0 to 50 is refused by the registry and ignored if it is found in the table. Owner: `pricing.write`. The quote shows a "Yearly discount" line, and the lines add up to the price. | `api/src/services/pricing.ts`, `setting-registry.ts`, `Commerce.tsx` (panel on the Pricing screen), `Deploy.tsx` |
| Margin per product | Revenue by product now has an allocated cost and a margin. The cost of the nodes is shared by the memory each product sells. It is an allocation, not a measurement, and the screen says so. It is "Not declared" and "Unknown", never zero, when the cost of the nodes is not declared. The shares add up to the cost. | `capacity.ts` (`allocateProductMargin`), `Capacity.tsx` |
| Panel access on the customer | Shows the panel account and whether a key is stored, from where, and when it was used. An operator can store a key (password field, never shown again) or forget it. | `CustomerDetail.tsx` |
| Mark an invoice as paid | For money that arrived outside the provider. Open invoices only, reference required. | `CustomerDetail.tsx` |
| Import a server | Administrators only. | `Services.tsx` |
| CMS block `site.announcement` | A notice above the menu of every public page, plain text, with an optional link. Taking it down removes it. | `content.ts`, `ui.tsx` |
| Browser audit | `scripts/admin-audit.sh` starts a disposable API and web server, seeds an administrator, opens every admin route on a desktop and on a phone, and records console errors, failed requests, error states, sideways scroll and missing headings. Four more tests drive the new controls. | `web/e2e/admin-audit.spec.ts`, `api/scripts/admin-audit-seed.ts` |

## Not built, on purpose
- **Tax.** No rule was invented.
- `POST /admin/instances/:id/database-limit` has no screen: the screen already has "Save limits", which sets databases, backups and allocations together and supersedes it.
- `GET /admin/money` is a stub that returns an example. It has no screen.

## What the browser audit found
- 28 admin routes on a desktop and on a phone: no JavaScript error, no sideways scroll, no missing heading, no redirect to the login page.
- A label of my own (the discount field) was not tied to its input. Fixed.
- On the Pricing screen the Capacity panel shows "could not be loaded" with a Retry button when the game panel cannot be reached (HTTP 502 from `/api/admin/capacity`). The rest of the page works. This was seen in the disposable stack, where the game panel does not exist.
- 109 console messages about `fontawesome/css/pro.min.css` come from the clone, where the licensed files are not installed. The live site serves the file (200, `text/css`).
- The audit does not click every button. It opens every screen and exercises the controls added in this round.

## Tests
- API: the full suite ran with 1366 passed, 1 failed, 6 skipped. The one failure was a fixture of my own test of the VPS allocator (orders built at the same moment shared a number); fixed, and it passed three times alone. The full suite was run again after the fix: 148 files passed, 1367 tests passed, 0 failed.
- Web: 376 passed, 0 failed, 2 skipped.
- New: `yearly-discount` (14), `product-margin` (5), `content` (+3), and the browser audit (5).

## Not verified
- The discount was tested in the arithmetic, the setting and the screen. It was **not** tried against Stripe: a yearly subscription created with a discount, its renewal and a plan change were not run against a Stripe test account. Services that exist keep their price until the prices are reconciled (Operator tools, with a dry run first).
- The margin depends on the cost of the nodes that the operator declared.
- The announcement was tested through the API and the content tests; its look on the public site was not captured in a browser.
