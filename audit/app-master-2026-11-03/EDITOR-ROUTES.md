# Blipmade App 3.0 — Dedicated Create/Edit/Action Routes

**Status:** proposed URL blueprint, no new routes have been implemented here.
**Current routes:** 21. All proposals are additive. Existing deep links, VPS redirects, tab names and billing invoices must continue to work.

**Authoritative rule:** serious creation/editing/configuration and financial/destructive workflows use dedicated full pages with meaningful URLs, not giant popups or endless inline forms. Natural inline workspaces (console, file explorer, code editor, support reply) remain inline. Tiny rename may remain contextual only if it is genuinely one field and doesn't sacrifice history/validation; default prefer dedicated editor for persistent changes.

## Exact migration table

| Area | Existing destination | Current action | New dedicated route(s) | Special components | Backend/security acceptance |
|---|---|---|---|---|---|
| **Overview & navigation** | `/app` | Open issue or service card, quick deploy, billing CTA | `Keep direct contextual link, no editor on overview` | ResourceHeader/StatusBadge/MetricTile | Own data only; deep links reflect service ID. |
| **Deploy catalog** | `/app/deploy` | Search/sort/category and select product | `/app/deploy/:slug` | FilterBar, SearchField, ProductCompareCard | Filtered catalog from backend with availability and pricing; no confusing hidden options. |
| **Deploy wizard** | `/app/deploy/:slug` | Choose configuration, product variables, resource amount, billing period, promotions, billing address and EULA | `Existing full-page /app/deploy/:slug with ?step=..., optionally /app/orders/:id` | UnitStepper, ResourceSliderStepper, PlanCards, BillingPeriod, KeyValueEditor, QuoteSummary, ProgressStepper | Server price quote, idempotent checkout, draft validation, no secret leaked via URL. |
| **Instance resource change** | `/app/instances/:id` | Edit CPU/RAM/disk via embedded panel | `/app/instances/:id/resources/edit` | UnitStepper, ResourceSliderStepper, QuoteSummary, ImpactReview | Provider/plan min/max, disk shrink rules, billing difference, asynchronous provider outcome. |
| **Instance name/description** | `/app/instances/:id/:tab` | Rename and update description in settings tab | `/app/instances/:id/settings/edit` | TextInput, Textarea, save-dirty footer | Server-side ownership, conflict, audit; keep original settings tab read-only summary. |
| **Instance startup variables** | `/app/instances/:id/startup` | Edit startup command/env and container image | `/app/instances/:id/startup/edit` | EnvEditor, SecretField, VersionDiff, CodeEditor | Avoid logging variable secrets; do not invent mutable image capabilities; restart impact. |
| **Instance .env file** | `/app/instances/:id/startup` | Edit parsed .env fields inline in StartupTab | `/app/instances/:id/env-files/:name/edit` | EnvEditor, KeyValueEditor, DiffViewer | Relative file path safety, secret masking, checksum conflict. |
| **Instance files** | `/app/instances/:id/files` | Create/move/copy/upload/download/delete; code edit | `/app/instances/:id/files?path=...&edit=1 or dedicated /app/instances/:id/files/edit` | FileExplorer, FileDropzone, CodeEditor, ContextMenu, UploadManager | File editor is a workspace; not a full-page wizard per rename. Preserve existing context menus, folders and selection. |
| **Instance database** | `/app/instances/:id/databases` | Create DB and reset password via embedded forms/dialogs | `/app/instances/:id/databases/new` / `/app/instances/:id/databases/:databaseId/security` | DBNameField, CredentialViewer, PasswordResetReview | One-time credentials, DB quota, exact service scope, prevent cross-server access. |
| **Instance network** | `/app/instances/:id/network` | Create allocation, rename/make primary, remove | `/app/instances/:id/network/new` / `/app/instances/:id/network/:allocationId/edit` | IPPortInput, PortSelector, InfoTooltip, StatusBadge | Provider allocation rules, reserved port conflict and primary address constraints. |
| **Instance backups** | `/app/instances/:id/backups` | Set schedule, create backup, restore/delete | `/app/instances/:id/backups/new` / `/app/instances/:id/backup-schedule/edit` / `/app/instances/:id/backups/:backupId/restore` | RetentionSelector, CronBuilder (supported schedules only), BackupReview | Restore is destructive and needs full review/confirmation, size/quota/provider state. |
| **Instance schedules** | `/app/instances/:id/schedules` | Create cron, enable/disable, run/delete | `/app/instances/:id/schedules/new` / `/app/instances/:id/schedules/:scheduleId/edit` | CronBuilder, TimezonePicker, ValidationSummary | Cron grammar and job actions must match provider API; save draft and clear run state. |
| **Instance Git deploy** | `/app/instances/:id/git` | Connect repo, deploy, rotate webhook secret, rollback | `/app/instances/:id/git/connect` / `/app/instances/:id/git/settings` / `/app/instances/:id/git/deployments/:id/rollback` | GitURLField, BranchCombobox, SecretField, DeploymentTimeline, DiffViewer | Verify repo/webhook signature; do not log secret or tokens; rollback with confirmation. |
| **Instance shared access** | `/app/instances/:id/access` | Create share invites, role viewer/manager, revoke | `/app/instances/:id/access/invite` / `/app/instances/:id/access/:shareId/edit` | PermissionRoleCards, InviteCode, CopyableValue | Role/owner authorization, invite expiry and clear disclosure of permissions; no privilege escalation. |
| **Instance safety** | `/app/instances/:id/settings` | Reinstall, suspend/cancel service | `/app/instances/:id/reinstall` / `/app/instances/:id/cancel` | DestructiveReviewPage, Acknowledgement, DangerButton | Independent backup warning, exact name typed confirmation, billing/retention impact. |
| **Domains** | `/app/domains` | Add domain form and expanded DNS verification | `/app/domains/new` / `/app/domains/:id` / `/app/domains/:id/edit` | DomainInput, AsyncCombobox, DNSRecordInspector, ValidationSummary | Ownership TXT and Caddy/Cloudflare constraints; email domains separate. |
| **Email plan change** | `/app/mail` | MailPlanChangeDialog currently used | `/app/mail/services/:serviceId/plan/change` | PlanCompareCards, BillingPeriodSegmented, QuoteSummary | Use actual plan/term and Stripe checkout state, no automatic assumption that plan changed. |
| **Email add domain** | `/app/mail` | MailAddDomainDialog currently used | `/app/mail/domains/new` | DomainInput, DNSRecordInspector, PlanQuotaMeter | Service association when multiple mail plans, ownership and quota. |
| **Email mailbox create** | `/app/mail/domains/:id` | MailboxCreateDialog currently used | `/app/mail/domains/:id/mailboxes/new` | MailboxNameField, PasswordGenerator, StorageQuotaStepper, OneTimePassword | Exact API features, one-time secret, no password in log. |
| **Email alias create** | `/app/mail/domains/:id` | AliasCreateDialog currently used | `/app/mail/domains/:id/aliases/new` | AliasField, MailboxCombobox, DuplicateValidation | Validate destination belongs to allowed domain/service, avoid forwarding loop. |
| **Email domain settings** | `/app/mail/domains/:id` | Delete and DNS controls on current domain page | `/app/mail/domains/:id/settings` / `/app/mail/domains/:id/dns` | DNSRecordInspector, MailDomainHealth, DeleteReview | Mailboxes/aliases retention, DKIM/DNS propagation, protection from accidental deletion. |
| **VPS checkout** | `/app/vps/new` | Plan radio cards, billing term, SSH public key, dedicated IPv4, promo | `Keep existing full-page /app/vps/new, add review step in URL` | PlanCompareCards, SSHKeyField, BillingPeriod, QuoteSummary, ProgressStepper | Pricing server authoritative, public key validation and region capability. |
| **VPS settings** | `/app/vps/:id` | Power, diagnostics, snapshots, ISO, SSH key, rename, reinstall; many tabs | `/app/vps/:id/settings/edit` / `/app/vps/:id/ssh-key` / `/app/vps/:id/iso` / `/app/vps/:id/reinstall` | ButtonGroup for power, SSHKeyField, OSImagePicker, StatusTimeline, ConfirmReview | VPS provider state, no fake synchronous completion, permissions and recovery. |
| **VPS snapshots** | `/app/vps/:id` | Create/restore/delete snapshot | `/app/vps/:id/snapshots/new` / `/app/vps/:id/snapshots/:name/restore` | SnapshotList, StorageQuota, RestoreReview | Provider can reject snapshots or restoring running VM; protect data and costs. |
| **Billing overview** | `/app/billing` | Payment method/subscription cancel/resume, invoices, closed services mixed | `/app/billing/subscriptions/:id` / `/app/billing/payment-method` / `/app/billing/orders/:id` / `/app/billing/invoices/:id` | BillingDataGrid, MoneySummary, StatusTimeline, DateRangePicker | All euro/usd amounts accurate, no refunded=paid confusion. |
| **Subscription changes** | `/app/billing` | Cancel/renew/resume as modal or inline | `/app/billing/subscriptions/:id/renew` / `/app/billing/subscriptions/:id/cancel` / `/app/billing/subscriptions/:id/reactivate` | ContractSummary, BillingImpactReview, DangerReview | Cancellation effective date, retention, queued provider action, payment state. |
| **Ticket creation** | `/app/tickets` | Ticket create modal with subject/body/category/priority/service | `/app/tickets/new` | ServiceCombobox for Apps/VPS/Mail, AttachmentDropzone, RichTextComposer, CategorySelect | Must accept VPS service if linked by API; no self-claim SLA or staff-only priority; preserve drafts. |
| **Ticket conversation** | `/app/tickets/:id` | Conversation panel and reply composer/attachments | `Keep inline composer` / `status/transfer actions as route when complex` | ConversationTimeline, StickyReplyComposer, UploadManager, TicketStatus | No internal staff notes, no cross-customer attachments; scroll focused on thread. |
| **Profile and billing** | `/app/settings` | Profile, email change, billing address, password inline on settings tabs | `/app/settings/profile` / `/app/settings/email/change` / `/app/settings/password` / `/app/settings/billing-address` | IdentityForm, BillingAddressFields, SecurityCode, Country/Tax lookup | Reverify email, proper reauth, VAT validation, safe redirect. |
| **Security** | `/app/settings` | 2FA, passkeys, sessions, API keys and logs inline | `/app/settings/security` / `/app/settings/security/2fa` / `/app/settings/security/passkeys` / `/app/settings/security/sessions` / `/app/settings/api-keys/new` | OTPStepper, PasskeyList, SessionList, APIKeyScopeCards, OneTimeSecret | WebAuthn browser support, MFA recovery, session revocation, no token persistence. |
| **Notifications/privacy** | `/app/settings and /app/notifications` | Preferences, account closure, data export | `/app/settings/notifications` / `/app/settings/privacy` / `/app/settings/closure` | ToggleGroup, NotificationChannelMatrix, DataExportStatus, ClosureReview | Retention, verification and confirmation, no misleading instant deletion. |

## Route design contract
1. New editor routes must be registered in `web/src/routes.tsx` with customer-only area and own authenticated API.
2. Prefer nested routes that cannot conflict with the existing dynamic `:tab` route. Place specific routes before generic catch-all (or adjust matcher specificity).
3. Preserve /app/servers and /app/servers/:id redirects.
4. Breadcrumbs include resource name + section, not raw internal provider ID. Button opens exact route and Back returns to prior list with filters intact.
5. Editor has dirty guard, server-backed constraints, field-level validation, Save/Cancel with clear response, refresh, permission and 409 conflict recovery.
6. For destructive/financial changes, show full-page consequence/price preview with final confirmation and scoped idempotency.
7. If backend lacks a feature (e.g. mailbox password reset or full VPS resource scaling), do not show an enabled control until a real endpoint and capability check exist.
8. Never duplicate data in two editors; one canonical source of truth and coherent cross-links.
9. For API keys/passwords/OTP, secret disclosure is one-time and privacy-safe; no URL/log/local-storage secrets.
10. When a new route replaces an inline component, run parity tests and preserve original functionality before removing old presentation.
11. Keep /admin Activity Explorer and customer /app Activity separate by authorization and privacy scope; no internal support notes visible to end-user.
12. Add only contextual entry points, not 31 new sidebar links.

## Standard editor archetypes

**Wizard:** steps (not merely visual pills), progress, Back, Continue, Review, Checkout/Apply, server lifecycle status; quote updated only from API.

**Resource editor:** header with resource status/freshness, main form, contextual impact panel, sticky Save/Discard, red danger zone separate.

**Data editor:** typed inputs, current/effective values and realistic constraints, no 1000px inline form.

**Console/code/files:** dedicated full-height workspace with tabs and scroll containers rather than modal.

**Safety review:** irreversible or billed actions require exact subject + consequence + reason, backend eligibility and explicit confirmation.

**Customer roles:** principal customer vs shared instance viewer/manager must be verified for each action, not just user authenticated.
