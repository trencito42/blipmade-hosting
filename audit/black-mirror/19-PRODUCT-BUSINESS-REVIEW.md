# 19 — Product and business

## Commercial mismatch

Selling 59 DEPLOYABLE SKUs (games, runtimes, WordPress, Folding@Home, Discord, four VPS, three mail plans) from one RAID-0 box with live Stripe and no VAT path. That is a storefront of promises.

Competitors that survive: few SKUs, tested restore, tax decided, payments off until then.

## Awkward but “working”

- Dual catalogue (Product vs families) and five checkouts. Migration cost: pick one source, rewrite quotes once, high regression on prices.  
- Admin 30+ nav items wrapping APIs that exist. Under-used, not missing.  
- Readiness gate for VPS ignores capacity — technically a boolean “Proxmox URL set”.  
- Mail “on sale” = env flag, not a mailbox probe.  
- Public “49 things” vs 59 SKUs.

## Overengineered

Support bots/automations/analytics; Smart Connect (`GAME_CONNECT_ENABLED` unset); CatalogFamily overlay (#20) on a live Product table; CRM-shaped DeviceSignal (it is risk, not CRM).

## Underengineered

`onboot` for VPS; mail backup; VAT; egg `done` in git; VPS isolation; one status language; disk alerts.

## Opportunities (P4)

1. Sell Paper + one bot + one VPS only, with a restore video.  
2. One Deploy, one Catalog.  
3. Honest COMING_SOON on everything unwatched.  
4. ToS RPO for game files **after** mail/VPS/control-plane are copied off-host.  
5. Operator “start panel VM” should not require SSH — Proxmox `onboot` is cheaper than an admin button.

Do not replace the catalogue for sport.
