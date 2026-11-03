# Decisions

- One working copy `/root/work`; GitHub `main` is production truth; deploy only via `scripts/deploy.sh` on VM103 (docs/WORKFLOW.md). Publish via `scripts/publish.sh` (relay).
- Canonical branch for App/Admin 3.0: `audit/admin-master-spec-20261103`. Merge to main + deploy only on explicit user approval.
- Editors are routes marked `layout: 'editor'`; the shell shows Back in the top bar; `PageEditorShell` owns the single h1. Short forms: actions inline in card. Long forms: `stickyActions` bar inside content column. Phone bottom bar and chat button are hidden on editors.
- Custom tooltip is a single global layer driven by `data-tip`; native `title` is not used for hints (buttons map `title` → `data-tip`).
- Customer area is "quiet": Panel/Field/editor descriptions render as InfoTip, not paragraphs (`QuietProvider` in AppShell). Admin not quiet.
- Lists: server walks cursor pages (limit 200); web reads all with `getAll`, shows 20 per page with `usePaged`/`Pager`. Rows are clickable via `DataTable rowTo`.
- Primary action of a list page lives in the top bar (contextAction), on all widths.
- Instance cancel endpoint not exposed in UI: sets CANCELLED immediately, conflicts with "runs until period end". Billing subscription cancel is the single path.
- Access share role edit not built: API has no endpoint.
- Hints that explain are tooltips; warnings of destructive pages stay visible.
