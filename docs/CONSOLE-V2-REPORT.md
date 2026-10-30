# Console V2 — final report

Verification levels used below: **implemented** (code written), **typechecked**, **unit tested**, **browser tested** (Playwright, disposable fixtures, mocked API), **production verified** (checked against the live system).

## What changed

| Area | Level |
| --- | --- |
| Billing summary (`api/src/lib/billing-summary.ts`): monthly total counts servers by instance price, mail and VPS by subscription ÷ months, per-currency totals never summed, next renewal = nearest future charge | implemented, typechecked, unit tested (13 tests), deployed; not checked against a real Stripe renewal |
| Overview: unified services list, needs-attention, humanized activity, honest "unavailable" states | implemented, typechecked, browser tested (fixtures, 320–1920 px, 0 overflow, 0 console errors), deployed |
| Deploy catalog: sort, availability filter, resources line, rewritten product copy (74 descriptions applied to the catalog) | implemented, browser tested, descriptions production verified (dry run 0 left) |
| Apps & databases, Billing, Domains, Settings, Email, Notifications, Tickets, Servers pages | implemented, browser tested with fixtures; Settings now tabs, Panel header actions right-aligned |
| Domains: three-step verification text | implemented, browser tested |
| VPS page in tabs: Overview (usage), Console, Snapshots, Image and reinstall, Settings | implemented, typechecked, browser tested with fixtures, deployed |
| VPS backend: usage, rename, SSH key change, reinstall, snapshots, ISO mount/eject, serial console relay | implemented, typechecked. Proxmox calls verified with the platform token: usage, snapshot create/delete, ISO listing, termproxy reaching the login prompt. Key change, reinstall, ISO mount, restore **not exercised** |
| Staff: act as a customer (1 h, marked session, sensitive routes refused, audited), admin Servers page (power, retry, reinstall, delete) | implemented, typechecked, migration applied in production; **not exercised through the UI** |
| VPS launch prices (2.49 / 3.49 / 4.49 / 6.99 EUR, dedicated IPv4 +3.99) | applied to the catalog and read back from the public API |
| Accessibility: token contrast computed (all text ≥ 4.5:1; muted text 5.4–6.6:1), keyboard tabbing in the harness (every stop shows a focus indicator, no trap), unique accessible names for deploy buttons | tested in the harness only; no screen-reader pass |

## Not done, and why

- **Choice of operating system at reinstall.** Only one cloud-init template exists (Debian 13). Ubuntu, AlmaLinux and Alpine ISOs are on the hypervisor and can be mounted and installed by hand through the console.
- **Graphical (VNC) console.** The console is serial. An installer that needs a screen cannot be driven from it.
- **Direct staff buttons** on instances, subscriptions and account data (profile edit, credits). "Act as this customer" covers what the customer can do.
- **Tests for the new VPS and staff routes** (no unit tests were written for them).
- **Real card payment for a VPS** and the sweep of expired VPS were never run live.
- **Screen-reader and real-device checks.**

## Launch blockers

Legal and operator facts that must come from the operator, not from code, are in `docs/LAUNCH-BLOCKERS.md` (27 facts, 34 places). None was invented.

## Operational notes

- Production database dump before the migration: `~/pre-impersonation-20261030T210109Z.dump` on VM 103.
- Rollback images: `blipmade-{web,api,worker}:before-console-v2`, `before-vpsmgmt`, `before-admin`, `before-tabs`.
- ISO files on the hypervisor (`/var/lib/vz/template/iso`): Ubuntu 24.04.5 live server, AlmaLinux 9.8 minimal, Alpine 3.24.3 standard; checksums verified against the publishers.
