# 13 — Customer app and UX

## Browser (unauthenticated)

- `/` 200. `/app` `/admin` 200 SPA.  
- `/app/deploy` → login.  
- `/apps`: “49 things you can deploy right now” vs API 59 (BM-019).

Authenticated app, billing portal, instance console: BLOCKED (no authorized session). Mobile widths not screenshot-measured.

## Nav

Customer: Overview, Deploy, then My services (Apps, Servers, Domains, Email), Billing, Support, Settings. Phone: Overview, Services, Deploy, Support.

Duplicate concepts: “Apps & databases” vs “Services” vs “Servers”. A VPS is not an app; mail is not a server. Fine for operators; confusing for first buy.

Five deploy/checkout URLs (06). Status words: DEPLOYABLE vs COMING_SOON vs instance PENDING/PROVISIONING vs Wings `starting` — customer sees “deploy now” while installer never flips `installed` (BM-004).

## Product

One Deploy page. One status vocabulary: `Available` / `Not for sale` / `Setting up` / `Running` / `Failed`. Drop the public count or bind it to the live filtered API. Do not ship dirty Deploy Studio over `8b07cd2d` until it replaces the other four paths.
