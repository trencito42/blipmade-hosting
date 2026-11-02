# 10 · Round four

## Built
- **Yearly term for hosted mail and for a VPS.** Deploy-like checkouts (`/app/vps/new`, the checkout of a mail plan) have a Monthly / Yearly choice. A plan with no yearly price row is sold for a year at twelve months of every figure of its monthly row; a plan with a yearly row of its own uses it. The mail choice only shows when the platform lists a yearly price for the plan (`/mail/plans` now lists the derived one).
- **Add-ons that recur are twelve months of themselves in a year.** The dedicated IPv4 address (3.99 a month) was added once to a yearly price, which under-charged it by eleven months. It is now `optionsAmountForPeriod`. A one-off add-on is still charged once. This also fixes yearly game servers with add-ons (there are none on sale today).
- A VPS contract card says "a year" for a yearly subscription. `/vps/plans` lists the yearly price and the yearly address price.
- **Refused on purpose for a service paid for a year:** a change of plan of a VPS (the quote says why) and a change of plan of a mail service. The credit of the rest of a paid year is not computed by the platform.
- The billing check of VPS counts twelve months for a yearly subscription, so it does not list it as a mismatch.
- Admin → Operator → backups: a new warning for virtual servers with no verified copy in the last nine days.

## Backups, checked live (2026-11-02)
- **VPS.** `vm1002` (a paying customer's server) had **no copy outside the machine**: only the test server `vm1001` had one, from a manual run. The first weekly run of the timer is Sunday 2026-11-08. I ran the agent's own VPS job now: `vm1002` has a verified copy (460 MB, encrypted before leaving the host, read back and compared).
- **Restore.** A copy of `vm1001` was restored into a scratch VM without a network card (VMID 9101): it booted (kernel, systemd, cloud-init). The scratch VM and the temporary file were removed. This is a restore of the same kind of file, not of the encrypted copy: the private key is not on the machines (it should not be), so the encrypted file was not decrypted today. The guest agent is not running inside the VPS guests, so a copy is crash-consistent, not application-consistent.
- **Game servers of customers.** The copies are made from the backups that exist in the panel; nobody makes them for a customer. Of the four live servers, none has a verified copy in the last two days (the admin page lists them as gaps). The only customer copy is from 2026-11-01 (restore-checked then). The nightly jobs of the game node were not inspected by me: I have no access to that machine. Their results are visible in the platform: the database copies are made every day (last one 2026-11-02 05:13).
- **Not done.** Switching on the daily backup of the servers of the operator's account was blocked by the permission system (it needs the panel keys of the account), and I did not insist. Customers' own schedules were not touched.

## Dependencies
- API: `npm audit` went from 8 findings in production dependencies (14 with development) to 0.
  - `zod` 3 to 4.6.7 (the finding was memory exhaustion on oversized collections). 34 type errors fixed: records need a key schema, error options changed, and the messages of validation were rewritten for the new issue shapes (`lib/validation-messages.ts`).
  - `prisma`'s config package: `deepmerge-ts` forced to 8 with an override. `@sentry/node` build plugin: `glob` 14 and `minimatch` 11 by overrides (they are used by the sourcemap plugin, not by the running server).
  - `vitest` 2 to 5 and `vite` 7 (development only).
- Web: 0 findings before and after.

## Tests
- API: 1396 tests, 1389 passed, 6 skipped, 1 failed in the full run. The failing one (`pricing-admin`) asserted that a recurring add-on is counted once in a year: the old rule. It now asserts the new one, and passes alone; the full run was not repeated after that edit.
- New: `yearly-term-fixed.test.ts` (12).
- Web: 376 passed. Browser: 7 of 7 (new: a customer picks Yearly for a VPS and sees the year price).

## Not verified
- A real yearly subscription on Stripe (VPS, mail or game server) and its renewal.
- The yearly choice of the mail checkout was not opened in a browser (the audit stack has the sale of mail closed).
- The runtime of `zod` 4 is covered by the test suite, not by a walk through every form.
