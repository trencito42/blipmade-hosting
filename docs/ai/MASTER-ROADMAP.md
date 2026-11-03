# Master roadmap

Source of truth: repo `trencito42/blipmade-hosting`, branch `audit/admin-master-spec-20261103` (canonical working branch), `main` = production truth. Production is deployed only with `bash scripts/deploy.sh` on VM103 (see `docs/WORKFLOW.md`). Working copy: `/root/work`.

Spec documents: `audit/app-master-2026-11-03/*` (PRODUCT-DESIGN, VIEW-MATRIX, EDITOR-ROUTES, GLOBAL-SHELL-EDITOR-UX, IMPLEMENTATION-QA), `audit/admin-master-2026-11-03/*`.

## Workstreams (dependency order)

| # | Workstream | Depends on | Acceptance |
|---|---|---|---|
| 1 | Global shell + editor UX (one h1, back in top bar, inline/sticky actions, footer, phone bar) | – | GLOBAL-SHELL-EDITOR-UX.md §G |
| 2 | Design system: tooltip layer, quiet mode, ButtonGroup, divided rows, Pager | 1 | one inventory pattern on all list pages |
| 3 | App dedicated editors (EDITOR-ROUTES table) | 1,2 | every persistent edit = own route, dirty guard |
| 4 | App views per VIEW-MATRIX (inventory, workspace, settings, billing, tickets) | 2,3 | VIEW-MATRIX "Target UX" per route |
| 5 | Admin 3.0 (audit/admin-master-2026-11-03) | 2 | not started; shares components |
| 6 | Issue #21 resource resize proration + 2 changes/30 days | 4 | needs finance/legal sign-off (OPERATOR-ACTIONS) |
| 7 | Issue #20 catalogue families/variants/presets/add-ons | 4 | additive admin draft in progress; no live catalogue change |
| 8 | Issue #22 post-purchase Add-ons / Repurpose / profiles | 7 | consumes #20 contract |
| 9 | Issue #19 game-aware instance workspace, Minecraft manager | 7,8 | additive; after #20/#22 |
| 10 | Issue #23 Domains 2.0 Cloudflare DNS | 4 | needs Cloudflare credentials (operator) |
| 11 | Issue #18 Smart Deploy ZIP/Git import | 7 | future; research first |

## GitHub issues (open, 2026-11-03)
#18 Smart Deploy import · #19 game-aware dashboards · #20 catalogue regroup · #21 resource resizing · #22 post-purchase control · #23 Domains 2.0.
All six still forbid a live catalogue, DNS or price change without a separate owner approval. #20 now has an additive admin draft on `main`. The others are not started. #21 and #23 stay blocked on the operator actions.
