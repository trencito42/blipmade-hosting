# 12 — Admin 3.0

`/admin` HTTP 200 unauthenticated = SPA shell, not an open console. Click-every-page BLOCKED.

## Navigation

`web/src/nav.ts`: **30+** `ADMIN_NAV` items, grouped in `ADMIN_GROUPS`. Phone tabs: Dashboard, Customers, Support, Audit.

Two catalogue screens: `/admin/products` (Catalog) and `/admin/catalog/families` (BM-020). Settings.tsx also links Catalog as products.

Staff: list, add, invite, permissions edit, remove (`routes.tsx` 410–414). APIs: GET/PUT `/admin/staff`, invitations. Step-up assumed via existing staff-lifecycle — live click UNVERIFIED.

## Route vs resource

Admin Products: GET/POST/PATCH/DELETE `/api/admin/products`. That can change live storefront SKUs. Dangerous with payments on.

Queues, ops, incidents, abuse, mail, notifications, email wording, content, tools, audit, activity, integrations — screens exist. Whether each mutates the real resource was not clicked. Code pattern: admin pages call `/api/admin/*` with `requireStaff`.

## Product

Admin is a second product. Operators cannot hold 30 destinations. Collapse: Customers, Orders, Services, one Catalog, Support, Ops, Staff, Settings. Hide families until Product is gone (or reverse). Do not add Deploy Studio as a third catalog UI (dirty tree only).
