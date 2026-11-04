import { Suspense, lazy, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { AppShell, ErrorState, LoadingBlock } from './ui-app';
import { ADMIN_GROUPS, ADMIN_NAV, CUSTOMER_GROUPS, ADMIN_PHONE_TABS, CUSTOMER_NAV, CUSTOMER_PHONE_TABS, CUSTOMER_SERVICE_PAGES } from './nav';
import { useSession } from './session';
import { ParamsProvider, matchPath, useParams, useRouter } from './router';
import { Link } from './router';
import { isStaff, loginRedirect, postLoginTarget } from './auth-guard';
import { Icon } from './icons';
import { get, post } from './lib/api';

// The public site. The home, the apps and the screens of the account stay in
// the main bundle, because they are the pages a visitor lands on. The
// documentation and the legal pages carry a lot of text, so they are split
// and are only fetched when they are opened.
import Home from './site/Home';
import { Apps, AppDetail } from './site/Apps';
import { AuthForgot, AuthLogin, AuthRegister, AuthReset, AuthVerify } from './site/Auth';
import NotFound from './site/NotFound';
import { Page } from './site/ui';
import { matchPublic, type PublicMatch } from './site/public-routes';

const DocsIndex = lazy(() => import('./site/Docs').then((module) => ({ default: module.DocsIndex })));
const DocsArticle = lazy(() => import('./site/Docs').then((module) => ({ default: module.DocsArticle })));
const LegalPage = lazy(() => import('./site/Legal').then((module) => ({ default: module.LegalPage })));
// The head of a page names the page, and the meta of a page of the
// documentation names the text of that page. The text is a large file, so the
// head is fetched when a page of the public site is opened.
const Head = lazy(() => import('./site/Head').then((module) => ({ default: module.Head })));

const Status = lazy(() => import('./pages/Status'));
const ServerError = lazy(() => import('./pages/ServerError'));

const AppOverview = lazy(() => import('./app/Overview'));
const AppInstances = lazy(() => import('./app/Instances'));
const AppInstanceDetail = lazy(() => import('./app/InstanceDetail'));
const AppEditInstanceSettings = lazy(() => import('./app/instance/EditInstanceSettings'));
const AppNewDatabase = lazy(() => import('./app/instance/NewDatabase'));
const AppNewAllocation = lazy(() => import('./app/instance/NewAllocation'));
const AppNewBackup = lazy(() => import('./app/instance/NewBackup'));
const AppEditBackupSchedule = lazy(() => import('./app/instance/EditBackupSchedule'));
const AppRestoreBackup = lazy(() => import('./app/instance/RestoreBackup'));
const AppNewSchedule = lazy(() => import('./app/instance/NewSchedule'));
const AppEditSchedule = lazy(() => import('./app/instance/EditSchedule'));
const AppEditGitSettings = lazy(() => import('./app/instance/EditGitSettings'));
const AppNewAccessInvite = lazy(() => import('./app/instance/NewAccessInvite'));
const AppReinstallInstance = lazy(() => import('./app/instance/ReinstallInstance'));
const AppEditAllocation = lazy(() => import('./app/instance/EditAllocation'));
const AppDatabaseSecurity = lazy(() => import('./app/instance/DatabaseSecurity'));
const AppEditStartup = lazy(() => import('./app/instance/EditStartup'));
const AppCancelSubscription = lazy(() => import('./app/SubscriptionChange').then((module) => ({ default: module.CancelSubscription })));
const AppResumeSubscription = lazy(() => import('./app/SubscriptionChange').then((module) => ({ default: module.ResumeSubscription })));
const AppRollbackDeployment = lazy(() => import('./app/instance/RollbackDeployment'));
const AppEditDomainAddress = lazy(() => import('./app/DomainChange').then((module) => ({ default: module.EditDomainAddress })));
const AppDeleteDomain = lazy(() => import('./app/DomainChange').then((module) => ({ default: module.DeleteDomain })));
const AppChangePassword = lazy(() => import('./app/ChangePassword'));
const AppChangeEmail = lazy(() => import('./app/SettingsEditors').then((module) => ({ default: module.ChangeEmail })));
const AppEditBillingAddress = lazy(() => import('./app/SettingsEditors').then((module) => ({ default: module.EditBillingAddress })));
const AppNotificationPreferences = lazy(() => import('./app/NotificationPreferences'));
const AdminSupportBotNew = lazy(() => import('./admin/SupportBotNew'));
const AdminSupportBotEdit = lazy(() => import('./admin/SupportBotEdit'));
const AdminSupportAutomationEdit = lazy(() => import('./admin/SupportAutomationEdit'));
const AdminStaffEdit = lazy(() => import('./admin/StaffEdit'));
const AdminStaffAdd = lazy(() => import('./admin/StaffAccess').then((module) => ({ default: module.StaffAdd })));
const AdminStaffInvite = lazy(() => import('./admin/StaffAccess').then((module) => ({ default: module.StaffInvite })));
const AdminStaffRemove = lazy(() => import('./admin/StaffAccess').then((module) => ({ default: module.StaffRemove })));
const StaffInviteAccept = lazy(() => import('./admin/StaffInviteAccept'));
const AdminIncidentNew = lazy(() => import('./admin/IncidentEditors').then((m) => ({ default: m.IncidentNew })));
const AdminIncidentUpdateNew = lazy(() => import('./admin/IncidentEditors').then((m) => ({ default: m.IncidentUpdateNew })));
const AdminAnnouncementNew = lazy(() => import('./admin/IncidentEditors').then((m) => ({ default: m.AnnouncementNew })));
const AdminKnowledgeEdit = lazy(() => import('./admin/KnowledgeEdit'));
const AdminContentEdit = lazy(() => import('./admin/ContentEdit'));
const AdminEmailTemplateEdit = lazy(() => import('./admin/EmailTemplateEdit'));
const AdminSettingsEdit = lazy(() => import('./admin/SettingsEdit'));
const AdminRatesEdit = lazy(() => import('./admin/PricingEditors').then((m) => ({ default: m.RatesEdit })));
const AdminPriceEdit = lazy(() => import('./admin/PricingEditors').then((m) => ({ default: m.PriceEdit })));
const AdminOrderRefund = lazy(() => import('./admin/OrderActions').then((m) => ({ default: m.OrderRefund })));
const AdminOrderRetry = lazy(() => import('./admin/OrderActions').then((m) => ({ default: m.OrderRetry })));
const AdminVpsPlanChange = lazy(() => import('./admin/VpsAdminEditors').then((m) => ({ default: m.VpsPlanChange })));
const AdminVpsResourcesEdit = lazy(() => import('./admin/VpsAdminEditors').then((m) => ({ default: m.VpsResourcesEdit })));
const AdminCustomerCredit = lazy(() => import('./admin/CustomerEditors').then((m) => ({ default: m.CustomerCreditAdjust })));
const AdminCustomerNoteNew = lazy(() => import('./admin/CustomerEditors').then((m) => ({ default: m.CustomerNoteNew })));
const AdminMailPlanEdit = lazy(() => import('./admin/MailPlanEdit'));
const AdminSupportSettings = lazy(() => import('./admin/SupportSettings'));
const AdminServiceLimits = lazy(() => import('./admin/ServiceLimitsEdit'));
const AdminAuditEntry = lazy(() => import('./admin/AuditEntry'));
const AdminNotificationPreview = lazy(() => import('./admin/NotificationEditors').then((m) => ({ default: m.NotificationTemplatePreview })));
const AdminNotificationTest = lazy(() => import('./admin/NotificationEditors').then((m) => ({ default: m.NotificationTestSend })));
const AdminCustomerAccountAction = lazy(() => import('./admin/CustomerEditors').then((m) => ({ default: m.CustomerAccountAction })));
const AdminAbuseEnforcement = lazy(() => import('./admin/abuse/AbuseEnforcement'));
const AdminProductNew = lazy(() => import('./admin/ProductNew'));
const AdminCatalogFamilies = lazy(() => import('./admin/catalog/Families'));
const AdminCatalogFamily = lazy(() => import('./admin/catalog/FamilyDetail'));
const AdminCatalogFamilyNew = lazy(() => import('./admin/catalog/Editors').then((module) => ({ default: module.FamilyNew })));
const AdminCatalogFamilyEdit = lazy(() => import('./admin/catalog/Editors').then((module) => ({ default: module.FamilyEdit })));
const AdminCatalogVariantNew = lazy(() => import('./admin/catalog/Editors').then((module) => ({ default: module.VariantNew })));
const AdminCatalogVariantEdit = lazy(() => import('./admin/catalog/Editors').then((module) => ({ default: module.VariantEdit })));
const AdminCatalogPresetNew = lazy(() => import('./admin/catalog/Editors').then((module) => ({ default: module.PresetNew })));
const AdminCatalogPresetEdit = lazy(() => import('./admin/catalog/Editors').then((module) => ({ default: module.PresetEdit })));
const AdminCatalogAddonNew = lazy(() => import('./admin/catalog/Editors').then((module) => ({ default: module.AddonNew })));
const AdminCatalogAddonEdit = lazy(() => import('./admin/catalog/Editors').then((module) => ({ default: module.AddonEdit })));
const AdminOpsDeclare = lazy(() => import('./admin/OpsDeclare'));
const AdminCustomerProfile = lazy(() => import('./admin/CustomerEditors').then((m) => ({ default: m.CustomerProfileEdit })));
const AdminCustomerSecurity = lazy(() => import('./admin/CustomerEditors').then((m) => ({ default: m.CustomerSecurityActions })));
const AdminAddonNew = lazy(() => import('./admin/CommerceEditors').then((m) => ({ default: m.AddonNew })));
const AdminAddonEdit = lazy(() => import('./admin/CommerceEditors').then((m) => ({ default: m.AddonEdit })));
const AdminYearlyDiscount = lazy(() => import('./admin/CommerceEditors').then((m) => ({ default: m.YearlyDiscountEdit })));
const AdminServiceImport = lazy(() => import('./admin/ServiceImport'));
const AdminOrderPartialRefund = lazy(() => import('./admin/OrderActions').then((m) => ({ default: m.OrderPartialRefund })));
const AdminCustomerBulk = lazy(() => import('./admin/CustomerBulkEdit'));
const AdminReportExports = lazy(() => import('./admin/ReportExports'));
const AdminActivity = lazy(() => import('./admin/Activity'));
const AdminQueueJob = lazy(() => import('./admin/OpsDetailPages').then((m) => ({ default: m.QueueJob })));
const AdminInfraNode = lazy(() => import('./admin/OpsDetailPages').then((m) => ({ default: m.InfrastructureNode })));
const AdminAbuseReopen = lazy(() => import('./admin/abuse/AbuseReopen'));
const AdminPromotionEdit = lazy(() => import('./admin/PromotionEdit'));
const AdminPromotionNew = lazy(() => import('./admin/PromotionNew'));
const AppApiKeyNew = lazy(() => import('./app/ApiKeyNew'));
const AppSetupTwoFactor = lazy(() => import('./app/TwoFactorEditors').then((module) => ({ default: module.SetupTwoFactor })));
const AppDisableTwoFactor = lazy(() => import('./app/TwoFactorEditors').then((module) => ({ default: module.DisableTwoFactor })));
const AppRenewBackupCodes = lazy(() => import('./app/TwoFactorEditors').then((module) => ({ default: module.RenewBackupCodes })));
const AppPasskeyNew = lazy(() => import('./app/PasskeyNew'));
const AppCloseAccount = lazy(() => import('./app/SettingsEditors').then((module) => ({ default: module.CloseAccount })));
const AppEditResources = lazy(() => import('./app/instance/EditResources'));
const AppRenameVps = lazy(() => import('./app/VpsEditors').then((module) => ({ default: module.RenameVps })));
const AppChangeVpsKey = lazy(() => import('./app/VpsEditors').then((module) => ({ default: module.ChangeVpsKey })));
const AppMountVpsIso = lazy(() => import('./app/VpsEditors').then((module) => ({ default: module.MountVpsIso })));
const AppReinstallVps = lazy(() => import('./app/VpsEditors').then((module) => ({ default: module.ReinstallVps })));
const AppNewVpsSnapshot = lazy(() => import('./app/VpsEditors').then((module) => ({ default: module.NewVpsSnapshot })));
const AppRestoreVpsSnapshot = lazy(() => import('./app/VpsEditors').then((module) => ({ default: module.RestoreVpsSnapshot })));
const AppOrderView = lazy(() => import('./app/OrderView'));
const AppSubscriptionView = lazy(() => import('./app/SubscriptionChange').then((module) => ({ default: module.SubscriptionView })));
const AppRedeemAccess = lazy(() => import('./app/RedeemAccess'));
const AppDomainDetail = lazy(() => import('./app/DomainChange').then((module) => ({ default: module.DomainDetail })));
const AdminProductEdit = lazy(() => import('./admin/ProductEdit'));
const AppActivity = lazy(() => import('./app/Activity'));
const AppEditAccessRole = lazy(() => import('./app/instance/EditAccessRole'));
const AppEditEnvFile = lazy(() => import('./app/instance/EditEnvFile'));
const AppDeployCatalog = lazy(() => import('./app/DeployCatalog'));
const AppFamilyDeploy = lazy(() => import('./app/FamilyDeploy'));
const AppDeploy = lazy(() => import('./app/Deploy'));
const AppDomains = lazy(() => import('./app/Domains'));
const AppNewDomain = lazy(() => import('./app/NewDomain'));
const AppMail = lazy(() => import('./app/Mail'));
const AppNewMailDomain = lazy(() => import('./app/mail/NewMailDomain'));
const AppNewMailbox = lazy(() => import('./app/mail/NewMailbox'));
const AppNewAlias = lazy(() => import('./app/mail/NewAlias'));
const AppMailDomainSettings = lazy(() => import('./app/mail/MailDomainSettings'));
const AppChangeMailPlan = lazy(() => import('./app/mail/ChangeMailPlan'));
const AppMailDomain = lazy(() => import('./app/mail/MailDomainPage'));
const EmailStorefront = lazy(() => import('./app/EmailHosting'));
const VpsStorefront = lazy(() => import('./app/Vps'));
const VpsCheckout = lazy(() => import('./app/Vps').then((module) => ({ default: module.VpsCheckout })));
const VpsList = lazy(() => import('./app/Vps').then((module) => ({ default: module.VpsList })));
const VpsDetail = lazy(() => import('./app/Vps').then((module) => ({ default: module.VpsDetail })));
const EmailCheckout = lazy(() => import('./app/EmailHosting').then((module) => ({ default: module.EmailCheckout })));
const AppBilling = lazy(() => import('./app/Billing'));
const AppTickets = lazy(() => import('./app/Tickets'));
const AppNewTicket = lazy(() => import('./app/NewTicket'));
const AppTicketDetail = lazy(() => import('./app/TicketDetail'));
const AppConnectionsSettings = lazy(() => import('./app/ConnectionsSettings').then((m) => ({ default: m.ConnectionsSettings })));
const AppDisconnectProvider = lazy(() => import('./app/ConnectionsSettings').then((m) => ({ default: m.DisconnectProvider })));
const AppSettings = lazy(() => import('./app/Settings'));
const AppNotifications = lazy(() => import('./app/Notifications'));

const InvoiceView = lazy(() => import('./app/InvoiceView'));
const AdminIncidents = lazy(() => import('./admin/Incidents'));
const AdminReports = lazy(() => import('./admin/Reports'));
const AdminQueues = lazy(() => import('./admin/Queues'));
const AdminAbuse = lazy(() => import('./admin/Abuse'));
const AdminAbuseDetail = lazy(() => import('./admin/abuse/AbuseDetail'));
const ReportAbusePage = lazy(() => import('./pages/ReportAbuse'));
const AdminEmailTemplates = lazy(() => import('./admin/EmailTemplates'));
const AdminContent = lazy(() => import('./admin/Content'));
const AdminTools = lazy(() => import('./admin/Tools'));
const AdminOverview = lazy(() => import('./admin/Overview'));
const AdminCustomers = lazy(() => import('./admin/Customers'));
const AdminCustomerDetail = lazy(() => import('./admin/CustomerDetail'));
const AdminOrders = lazy(() => import('./admin/Orders'));
const AdminOrderDetail = lazy(() => import('./admin/OrderDetail'));
const AdminServices = lazy(() => import('./admin/Services'));
const AdminServiceDetail = lazy(() => import('./admin/ServiceDetail'));
const AdminVps = lazy(() => import('./admin/Vps'));
const AdminProducts = lazy(() => import('./admin/Products'));
const AdminPricing = lazy(() => import('./admin/Pricing'));
const AdminTickets = lazy(() => import('./admin/Tickets'));
const AdminSupport = lazy(() => import('./admin/Support'));
const AdminSupportBots = lazy(() => import('./admin/SupportBots'));
const AdminSupportAutomations = lazy(() => import('./admin/SupportAutomations'));
const AdminSupportAnalytics = lazy(() => import('./admin/SupportAnalytics'));
const ChatWidget = lazy(() => import('./app/ChatWidget'));
const GuestChatWidget = lazy(() => import('./app/GuestChatWidget'));
const AdminKnowledge = lazy(() => import('./admin/Knowledge'));
const AdminTicketDetail = lazy(() => import('./admin/tickets/TicketDetail'));
const AdminPromotions = lazy(() => import('./admin/Promotions'));
const AdminPromotionDetail = lazy(() => import('./admin/PromotionDetail'));
const AdminInfrastructure = lazy(() => import('./admin/Infrastructure'));
const AdminOps = lazy(() => import('./admin/Ops'));
const AdminMail = lazy(() => import('./admin/Mail'));
const AdminMailPlans = lazy(() => import('./admin/MailProducts'));
const AdminAudit = lazy(() => import('./admin/Audit'));
const AdminStaff = lazy(() => import('./admin/Staff'));
const AdminSettings = lazy(() => import('./admin/Settings'));
const AdminIntegrations = lazy(() => import('./admin/Integrations'));
const AdminIntegrationsDiscord = lazy(() => import('./admin/IntegrationsDiscord'));
const AdminEmailNotifications = lazy(() => import('./admin/EmailNotifications'));

interface RouteDef {
  pattern: string;
  component: ComponentType;
  title: string;
  subtitle?: string;
  area?: 'customer' | 'admin';
  /**
   * `editor` marks a dedicated create, edit, review or safety page. The shell then shows the way back in
   * its top bar instead of a title, the page carries the one heading, and the phone navigation steps aside.
   */
  layout?: 'editor';
  exact?: boolean;
}

/**
 * The routes of the site.
 *
 * The public site is not in this table: the pages of the public site are
 * decided by `site/public-routes.ts`, which the browser and the program that
 * writes the site to the disk both use, so the two cannot disagree about the
 * address of a page.
 *
 * What is left here is the dashboard, the admin area, the status page, the
 * storefront of the hosted mail and the page of a failure of the server.
 */
export const ROUTES: RouteDef[] = [
  { pattern: '/status', component: Status, title: 'Service status' },
  { pattern: '/abuse', component: ReportAbusePage, title: 'Report abuse' },
  // The storefront of the hosted mail. It is public: a visitor reads the
  // limits of the plans before he makes an account.
  { pattern: '/email', component: EmailStorefront, title: 'Hosted mail' },
  { pattern: '/vps', component: VpsStorefront, title: 'VPS' },
  { pattern: '/deploy/:slug', component: DeployRedirect, title: 'Deploy' },

  // The page the server points at when it cannot answer. It is a route
  // of the site like any other, so it needs no rule of its own in the
  // server: the server already serves the site for every address that
  // has no extension.
  { pattern: '/500', component: ServerError, title: 'Server error' },

  { pattern: '/app', component: AppOverview, title: 'Overview', area: 'customer', exact: true },
  { pattern: '/app/instances', component: AppInstances, title: 'Apps & databases', area: 'customer' },
  { pattern: '/app/instances/:id/settings/edit', component: AppEditInstanceSettings, title: 'Edit instance settings', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/databases/new', component: AppNewDatabase, title: 'Create database', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/network/new', component: AppNewAllocation, title: 'Add network address', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/backups/new', component: AppNewBackup, title: 'Create backup', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/backup-schedule/edit', component: AppEditBackupSchedule, title: 'Backup schedule', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/backups/:backupId/restore', component: AppRestoreBackup, title: 'Restore backup', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/schedules/new', component: AppNewSchedule, title: 'New schedule', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/schedules/:scheduleId/edit', component: AppEditSchedule, title: 'Edit schedule', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/git/deployments/:deployId/rollback', component: AppRollbackDeployment, title: 'Roll back deployment', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/git/connect', component: AppEditGitSettings, title: 'Connect Git repository', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/git/settings', component: AppEditGitSettings, title: 'Git deployment settings', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/git/edit', component: AppEditGitSettings, title: 'Git deployment settings', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/access/:shareId/edit', component: AppEditAccessRole, title: 'Change role', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/access/invite', component: AppNewAccessInvite, title: 'Invite access', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/access/new', component: AppNewAccessInvite, title: 'Invite access', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/reinstall', component: AppReinstallInstance, title: 'Reinstall instance', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/network/:allocationId/edit', component: AppEditAllocation, title: 'Edit network address', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/databases/:databaseId/security', component: AppDatabaseSecurity, title: 'Database security', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/resources/edit', component: AppEditResources, title: 'Change resources', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/startup/edit', component: AppEditStartup, title: 'Edit startup', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id/env-files/:name/edit', component: AppEditEnvFile, title: 'Edit environment file', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/redeem', component: AppRedeemAccess, title: 'Use an access code', area: 'customer', layout: 'editor' },
  { pattern: '/app/instances/:id', component: AppInstanceDetail, title: 'Instance', area: 'customer' },
  { pattern: '/app/instances/:id/:tab', component: AppInstanceDetail, title: 'Instance', area: 'customer' },
  { pattern: '/app/deploy', component: AppDeployCatalog, title: 'Deploy', area: 'customer', exact: true },
  { pattern: '/app/deploy/families/:slug', component: AppFamilyDeploy, title: 'Choose a variant', area: 'customer' },
  { pattern: '/app/deploy/:slug', component: AppDeploy, title: 'Deploy', area: 'customer' },
  { pattern: '/app/domains', component: AppDomains, title: 'Domains', area: 'customer' },
  { pattern: '/app/domains/:id/edit', component: AppEditDomainAddress, title: 'Change address', area: 'customer', layout: 'editor' },
  { pattern: '/app/domains/:id/delete', component: AppDeleteDomain, title: 'Delete domain', area: 'customer', layout: 'editor' },
  { pattern: '/app/domains/new', component: AppNewDomain, title: 'Add domain', area: 'customer', layout: 'editor' },
  { pattern: '/app/domains/:id', component: AppDomainDetail, title: 'Domain', area: 'customer', exact: true },
  { pattern: '/app/mail', component: AppMail, title: 'Email', area: 'customer' },
  { pattern: '/app/mail/services/:serviceId/plan/change', component: AppChangeMailPlan, title: 'Change email plan', area: 'customer', layout: 'editor' },
  { pattern: '/app/mail/domains/new', component: AppNewMailDomain, title: 'Add email domain', area: 'customer', layout: 'editor' },
  { pattern: '/app/mail/domains/:id/mailboxes/new', component: AppNewMailbox, title: 'Create mailbox', area: 'customer', layout: 'editor' },
  { pattern: '/app/mail/domains/:id/aliases/new', component: AppNewAlias, title: 'Create alias', area: 'customer', layout: 'editor' },
  { pattern: '/app/mail/domains/:id/settings', component: AppMailDomainSettings, title: 'Email domain settings', area: 'customer', layout: 'editor' },
  { pattern: '/app/mail/domains/:id', component: AppMailDomain, title: 'Email', area: 'customer' },
  { pattern: '/app/servers', component: ServersRedirect, title: 'Servers', area: 'customer', exact: true },
  { pattern: '/app/servers/:id', component: ServersRedirect, title: 'Servers', area: 'customer' },
  { pattern: '/app/vps', component: VpsList, title: 'Servers', area: 'customer', exact: true },
  { pattern: '/app/vps/new', component: VpsCheckout, title: 'New server', area: 'customer' },
  { pattern: '/app/vps/:id/settings/edit', component: AppRenameVps, title: 'Rename server', area: 'customer', layout: 'editor' },
  { pattern: '/app/vps/:id/ssh-key', component: AppChangeVpsKey, title: 'Change SSH key', area: 'customer', layout: 'editor' },
  { pattern: '/app/vps/:id/iso', component: AppMountVpsIso, title: 'Boot from an image', area: 'customer', layout: 'editor' },
  { pattern: '/app/vps/:id/reinstall', component: AppReinstallVps, title: 'Reinstall server', area: 'customer', layout: 'editor' },
  { pattern: '/app/vps/:id/snapshots/new', component: AppNewVpsSnapshot, title: 'Take a snapshot', area: 'customer', layout: 'editor' },
  { pattern: '/app/vps/:id/snapshots/:name/restore', component: AppRestoreVpsSnapshot, title: 'Restore snapshot', area: 'customer', layout: 'editor' },
  { pattern: '/app/vps/:id', component: VpsDetail, title: 'Server', area: 'customer' },
  { pattern: '/app/email/checkout', component: EmailCheckout, title: 'Hosted mail', area: 'customer' },
  { pattern: '/app/billing/subscriptions/:id', component: AppSubscriptionView, title: 'Subscription', area: 'customer', exact: true },
  { pattern: '/app/billing/subscriptions/:id/cancel', component: AppCancelSubscription, title: 'Cancel subscription', area: 'customer', layout: 'editor' },
  { pattern: '/app/billing/subscriptions/:id/reactivate', component: AppResumeSubscription, title: 'Resume subscription', area: 'customer', layout: 'editor' },
  { pattern: '/app/billing/subscriptions/:id/resume', component: AppResumeSubscription, title: 'Resume subscription', area: 'customer', layout: 'editor' },
  { pattern: '/app/billing/orders/:id', component: AppOrderView, title: 'Order', area: 'customer' },
  { pattern: '/app/billing/invoices/:id', component: InvoiceView, title: 'Invoice', area: 'customer' },
  { pattern: '/app/billing', component: AppBilling, title: 'Billing', area: 'customer' },
  { pattern: '/app/tickets', component: AppTickets, title: 'Support', area: 'customer' },
  { pattern: '/app/tickets/new', component: AppNewTicket, title: 'New support ticket', area: 'customer', layout: 'editor' },
  { pattern: '/app/tickets/:id', component: AppTicketDetail, title: 'Ticket', area: 'customer' },
  { pattern: '/app/settings/email/change', component: AppChangeEmail, title: 'Change email address', area: 'customer', layout: 'editor' },
  { pattern: '/app/settings/billing-address', component: AppEditBillingAddress, title: 'Billing address', area: 'customer', layout: 'editor' },
  { pattern: '/app/settings/notifications', component: AppNotificationPreferences, title: 'Notification preferences', area: 'customer', layout: 'editor' },
  { pattern: '/app/settings/api-keys/new', component: AppApiKeyNew, title: 'New API key', area: 'customer', layout: 'editor' },
  { pattern: '/app/settings/security/2fa/backup-codes', component: AppRenewBackupCodes, title: 'New backup codes', area: 'customer', layout: 'editor' },
  { pattern: '/app/settings/security/2fa/disable', component: AppDisableTwoFactor, title: 'Turn off two-factor authentication', area: 'customer', layout: 'editor' },
  { pattern: '/app/settings/security/2fa', component: AppSetupTwoFactor, title: 'Set up two-factor authentication', area: 'customer', layout: 'editor' },
  { pattern: '/app/settings/security/passkeys/new', component: AppPasskeyNew, title: 'Add a passkey', area: 'customer', layout: 'editor' },
  { pattern: '/app/settings/closure', component: AppCloseAccount, title: 'Close the account', area: 'customer', layout: 'editor' },
  { pattern: '/app/settings/password', component: AppChangePassword, title: 'Change password', area: 'customer', layout: 'editor' },
  { pattern: '/app/settings/connections/:provider/disconnect', component: AppDisconnectProvider, title: 'Disconnect provider', area: 'customer', layout: 'editor' },
  { pattern: '/app/settings/connections', component: AppConnectionsSettings, title: 'Connected accounts', area: 'customer', layout: 'editor' },
  { pattern: '/app/settings', component: AppSettings, title: 'Settings', area: 'customer' },
  { pattern: '/app/activity', component: AppActivity, title: 'Activity', area: 'customer' },
  { pattern: '/app/notifications', component: AppNotifications, title: 'Notifications', area: 'customer' },

  { pattern: '/admin', component: AdminOverview, title: 'Dashboard', area: 'admin', exact: true },
  { pattern: '/admin/customers', component: AdminCustomers, title: 'Customers', area: 'admin' },
  { pattern: '/admin/customers/bulk-edit', component: AdminCustomerBulk, title: 'Edit tags', area: 'admin', layout: 'editor' },
  { pattern: '/admin/customers/:id/credit/adjust', component: AdminCustomerCredit, title: 'Give credit', area: 'admin', layout: 'editor' },
  { pattern: '/admin/customers/:id/notes/new', component: AdminCustomerNoteNew, title: 'New note', area: 'admin', layout: 'editor' },
  { pattern: '/admin/customers/:id/account-action', component: AdminCustomerAccountAction, title: 'Account action', area: 'admin', layout: 'editor' },
  { pattern: '/admin/customers/:id/profile/edit', component: AdminCustomerProfile, title: 'Edit customer', area: 'admin', layout: 'editor' },
  { pattern: '/admin/customers/:id/security', component: AdminCustomerSecurity, title: 'Security actions', area: 'admin', layout: 'editor' },
  { pattern: '/admin/customers/:id', component: AdminCustomerDetail, title: 'Customer', area: 'admin' },
  { pattern: '/admin/orders', component: AdminOrders, title: 'Orders', area: 'admin' },
  { pattern: '/admin/orders/:id/partial-refund', component: AdminOrderPartialRefund, title: 'Refund part', area: 'admin', layout: 'editor' },
  { pattern: '/admin/orders/:id/refund', component: AdminOrderRefund, title: 'Refund order', area: 'admin', layout: 'editor' },
  { pattern: '/admin/orders/:id/retry', component: AdminOrderRetry, title: 'Retry delivery', area: 'admin', layout: 'editor' },
  { pattern: '/admin/orders/:id', component: AdminOrderDetail, title: 'Order control', area: 'admin' },
  { pattern: '/admin/services', component: AdminServices, title: 'Services', area: 'admin' },
  { pattern: '/admin/services/import', component: AdminServiceImport, title: 'Import a server', area: 'admin', layout: 'editor' },
  { pattern: '/admin/services/:id/limits/edit', component: AdminServiceLimits, title: 'Service limits', area: 'admin', layout: 'editor' },
  { pattern: '/admin/services/:id', component: AdminServiceDetail, title: 'Service control', area: 'admin' },
  { pattern: '/admin/vps/:id/plan/change', component: AdminVpsPlanChange, title: 'Change plan', area: 'admin', layout: 'editor' },
  { pattern: '/admin/vps/:id/resources/edit', component: AdminVpsResourcesEdit, title: 'Adjust resources', area: 'admin', layout: 'editor' },
  { pattern: '/admin/vps', component: AdminVps, title: 'Servers', area: 'admin' },
  { pattern: '/admin/catalog/families/new', component: AdminCatalogFamilyNew, title: 'New family', area: 'admin', layout: 'editor' },
  { pattern: '/admin/catalog/families/:id/edit', component: AdminCatalogFamilyEdit, title: 'Edit family', area: 'admin', layout: 'editor' },
  { pattern: '/admin/catalog/families/:id/variants/new', component: AdminCatalogVariantNew, title: 'New variant', area: 'admin', layout: 'editor' },
  { pattern: '/admin/catalog/families/:id/variants/:variantId/edit', component: AdminCatalogVariantEdit, title: 'Edit variant', area: 'admin', layout: 'editor' },
  { pattern: '/admin/catalog/families/:id/presets/new', component: AdminCatalogPresetNew, title: 'New preset', area: 'admin', layout: 'editor' },
  { pattern: '/admin/catalog/families/:id/presets/:presetId/edit', component: AdminCatalogPresetEdit, title: 'Edit preset', area: 'admin', layout: 'editor' },
  { pattern: '/admin/catalog/families/:id/addons/new', component: AdminCatalogAddonNew, title: 'New catalogue add-on', area: 'admin', layout: 'editor' },
  { pattern: '/admin/catalog/families/:id/addons/:addonId/edit', component: AdminCatalogAddonEdit, title: 'Edit catalogue add-on', area: 'admin', layout: 'editor' },
  { pattern: '/admin/catalog/families/:id', component: AdminCatalogFamily, title: 'Catalogue family', area: 'admin' },
  { pattern: '/admin/catalog/families', component: AdminCatalogFamilies, title: 'Catalogue families', area: 'admin' },
  { pattern: '/admin/products/new', component: AdminProductNew, title: 'New product', area: 'admin', layout: 'editor' },
  { pattern: '/admin/products/:id/edit', component: AdminProductEdit, title: 'Edit product', area: 'admin', layout: 'editor' },
  { pattern: '/admin/products', component: AdminProducts, title: 'Catalog', area: 'admin' },
  { pattern: '/admin/pricing/rates/edit', component: AdminRatesEdit, title: 'Rate card', area: 'admin', layout: 'editor' },
  { pattern: '/admin/pricing/products/:id/edit', component: AdminPriceEdit, title: 'Edit price', area: 'admin', layout: 'editor' },
  { pattern: '/admin/pricing/addons/new', component: AdminAddonNew, title: 'New add-on', area: 'admin', layout: 'editor' },
  { pattern: '/admin/pricing/addons/:id/edit', component: AdminAddonEdit, title: 'Edit add-on', area: 'admin', layout: 'editor' },
  { pattern: '/admin/pricing/discounts/edit', component: AdminYearlyDiscount, title: 'Yearly discount', area: 'admin', layout: 'editor' },
  { pattern: '/admin/pricing', component: AdminPricing, title: 'Pricing', area: 'admin' },
  { pattern: '/admin/support/analytics', component: AdminSupportAnalytics, title: 'Support numbers', area: 'admin' },
  { pattern: '/admin/support/automations/new', component: AdminSupportAutomationEdit, title: 'New rule', area: 'admin', layout: 'editor' },
  { pattern: '/admin/support/automations/:id/edit', component: AdminSupportAutomationEdit, title: 'Edit rule', area: 'admin', layout: 'editor' },
  { pattern: '/admin/support/automations', component: AdminSupportAutomations, title: 'Support automations', area: 'admin' },
  { pattern: '/admin/support/bots/new', component: AdminSupportBotNew, title: 'New bot', area: 'admin', layout: 'editor' },
  { pattern: '/admin/support/bots/:id/edit', component: AdminSupportBotEdit, title: 'Edit bot', area: 'admin', layout: 'editor' },
  { pattern: '/admin/support/bots', component: AdminSupportBots, title: 'Support bots', area: 'admin' },
  { pattern: '/admin/support/settings', component: AdminSupportSettings, title: 'Support settings', area: 'admin', layout: 'editor' },
  { pattern: '/admin/support', component: AdminSupport, title: 'Support console', area: 'admin' },
  { pattern: '/admin/tickets', component: AdminTickets, title: 'Support queue', area: 'admin' },
  { pattern: '/admin/knowledge/new', component: AdminKnowledgeEdit, title: 'New article', area: 'admin', layout: 'editor' },
  { pattern: '/admin/knowledge/:id/edit', component: AdminKnowledgeEdit, title: 'Edit article', area: 'admin', layout: 'editor' },
  { pattern: '/admin/knowledge', component: AdminKnowledge, title: 'Knowledge base', area: 'admin', exact: true },
  { pattern: '/admin/tickets/:id', component: AdminTicketDetail, title: 'Ticket', area: 'admin' },
  { pattern: '/admin/promotions', component: AdminPromotions, title: 'Promotions', area: 'admin' },
  { pattern: '/admin/promotions/new', component: AdminPromotionNew, title: 'New promotion', area: 'admin', layout: 'editor' },
  { pattern: '/admin/promotions/:id/edit', component: AdminPromotionEdit, title: 'Edit campaign', area: 'admin', layout: 'editor' },
  { pattern: '/admin/promotions/:id', component: AdminPromotionDetail, title: 'Campaign control', area: 'admin' },
  { pattern: '/admin/infrastructure/nodes/:id', component: AdminInfraNode, title: 'Node', area: 'admin', layout: 'editor' },
  { pattern: '/admin/infrastructure', component: AdminInfrastructure, title: 'Infrastructure', area: 'admin' },
  { pattern: '/admin/incidents/new', component: AdminIncidentNew, title: 'New incident', area: 'admin', layout: 'editor' },
  { pattern: '/admin/incidents/:id/updates/new', component: AdminIncidentUpdateNew, title: 'New update', area: 'admin', layout: 'editor' },
  { pattern: '/admin/announcements/new', component: AdminAnnouncementNew, title: 'New announcement', area: 'admin', layout: 'editor' },
  { pattern: '/admin/incidents', component: AdminIncidents, title: 'Incidents', area: 'admin' },
  { pattern: '/admin/reports/exports', component: AdminReportExports, title: 'Export a report', area: 'admin', layout: 'editor' },
  { pattern: '/admin/reports', component: AdminReports, title: 'Reports', area: 'admin' },
  { pattern: '/admin/queues/:name/jobs/:id', component: AdminQueueJob, title: 'Job', area: 'admin', layout: 'editor' },
  { pattern: '/admin/queues', component: AdminQueues, title: 'Job queues', area: 'admin' },
  { pattern: '/admin/abuse', component: AdminAbuse, title: 'Abuse reports', area: 'admin' },
  { pattern: '/admin/abuse/:id/enforcement', component: AdminAbuseEnforcement, title: 'Suspend service', area: 'admin', layout: 'editor' },
  { pattern: '/admin/abuse/:id/reopen', component: AdminAbuseReopen, title: 'Reopen the case', area: 'admin', layout: 'editor' },
  { pattern: '/admin/abuse/:id', component: AdminAbuseDetail, title: 'Abuse report', area: 'admin' },
  { pattern: '/admin/ops/incident/declare', component: AdminOpsDeclare, title: 'Declare an incident', area: 'admin', layout: 'editor' },
  { pattern: '/admin/ops', component: AdminOps, title: 'Operations', area: 'admin' },
  { pattern: '/admin/mail', component: AdminMail, title: 'Mail', area: 'admin' },
  { pattern: '/admin/mail/plans/new', component: AdminMailPlanEdit, title: 'New mail plan', area: 'admin', layout: 'editor' },
  { pattern: '/admin/mail/plans/:id/edit', component: AdminMailPlanEdit, title: 'Edit mail plan', area: 'admin', layout: 'editor' },
  { pattern: '/admin/mail/plans', component: AdminMailPlans, title: 'Mail plans', area: 'admin' },
  { pattern: '/admin/activity', component: AdminActivity, title: 'Activity', area: 'admin' },
  { pattern: '/admin/audit/:id', component: AdminAuditEntry, title: 'Audit entry', area: 'admin', layout: 'editor' },
  { pattern: '/admin/audit', component: AdminAudit, title: 'Audit log', area: 'admin' },
  { pattern: '/admin/staff/add', component: AdminStaffAdd, title: 'Add a staff member', area: 'admin', layout: 'editor' },
  { pattern: '/admin/staff/invite', component: AdminStaffInvite, title: 'Invite a staff member', area: 'admin', layout: 'editor' },
  { pattern: '/admin/staff/:id/remove', component: AdminStaffRemove, title: 'Remove staff access', area: 'admin', layout: 'editor' },
  { pattern: '/admin/staff/:id/permissions/edit', component: AdminStaffEdit, title: 'Staff rights', area: 'admin', layout: 'editor' },
  { pattern: '/admin/staff', component: AdminStaff, title: 'Staff & permissions', area: 'admin' },
  { pattern: '/staff-invite', component: StaffInviteAccept, title: 'Accept a staff invitation' },
  { pattern: '/admin/settings/integrations/discord', component: AdminIntegrationsDiscord, title: 'Discord community', area: 'admin' },
  { pattern: '/admin/settings/integrations', component: AdminIntegrations, title: 'Integrations', area: 'admin' },
  { pattern: '/admin/settings/:section/edit', component: AdminSettingsEdit, title: 'Edit settings', area: 'admin', layout: 'editor' },
  { pattern: '/admin/settings', component: AdminSettings, title: 'Settings', area: 'admin' },
  { pattern: '/admin/email-templates/:id/edit', component: AdminEmailTemplateEdit, title: 'Edit email wording', area: 'admin', layout: 'editor' },
  { pattern: '/admin/email-templates', component: AdminEmailTemplates, title: 'Email wording', area: 'admin' },
  { pattern: '/admin/content/:key/edit', component: AdminContentEdit, title: 'Edit content', area: 'admin', layout: 'editor' },
  { pattern: '/admin/content', component: AdminContent, title: 'Site content', area: 'admin' },
  { pattern: '/admin/tools', component: AdminTools, title: 'Operator tools', area: 'admin' },
  { pattern: '/admin/notifications/templates/:id/preview', component: AdminNotificationPreview, title: 'Template preview', area: 'admin', layout: 'editor' },
  { pattern: '/admin/notifications/test', component: AdminNotificationTest, title: 'Test message', area: 'admin', layout: 'editor' },
  { pattern: '/admin/notifications', component: AdminEmailNotifications, title: 'Email & notifications', area: 'admin' },
];

/**
 * Marketing links of the shape /deploy/:slug point at the deploy page that
 * exists, /app/deploy/:slug. The page itself is not duplicated here: the
 * redirect hands over and the session guard on /app takes it from there, so
 * an anonymous visitor ends up on the login with ?next=/app/deploy/:slug.
 */
function DeployRedirect() {
  const { slug } = useParams();
  const { navigate } = useRouter();

  useEffect(() => {
    navigate(`/app/deploy/${encodeURIComponent(slug)}`, { replace: true });
  }, [navigate, slug]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6">
      <LoadingBlock rows={2} label="Opening the deploy page" />
    </div>
  );
}

/** The announcements of the platform (maintenance, news), above every page of the dashboard. A person can close one for the rest of the visit. */
function AnnouncementBanner() {
  const [items, setItems] = useState<{ id: string; title: string; body: string; severity: string }[]>([]);
  const [closed, setClosed] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('bm-announcements-closed') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    let alive = true;
    get<{ announcements: { id: string; title: string; body: string; severity: string }[] }>('/announcements')
      .then((answer) => alive && setItems(answer.announcements))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const shown = items.filter((item) => !closed.includes(item.id));
  if (shown.length === 0) return null;
  const close = (id: string) => {
    const next = [...closed, id];
    setClosed(next);
    try {
      sessionStorage.setItem('bm-announcements-closed', JSON.stringify(next));
    } catch {
      /* the banner simply comes back on the next page */
    }
  };
  return (
    <div className="mb-4 grid gap-2">
      {shown.map((item) => (
        <div key={item.id} role="note" className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-[14px] text-ink ${item.severity === 'warning' ? 'border-bad/40 bg-bad/10' : item.severity === 'maintenance' ? 'border-warn/40 bg-warn/10' : 'border-line bg-s2'}`}>
          <p><strong>{item.title}.</strong> {item.body}</p>
          <button type="button" onClick={() => close(item.id)} aria-label={`Close: ${item.title}`} className="shrink-0 rounded-lg px-2 text-ink3 hover:text-ink focus-visible:outline-2 focus-visible:outline-acc">×</button>
        </div>
      ))}
    </div>
  );
}

/** Shown on every page while a member of the staff acts as a customer. */
function ImpersonationBanner() {
  const { impersonatedBy, user, refresh } = useSession();
  const { navigate } = useRouter();
  const [busy, setBusy] = useState(false);
  if (!impersonatedBy) return null;
  const back = async () => {
    setBusy(true);
    try {
      await post('/admin/impersonation/stop');
    } finally {
      await refresh();
      navigate('/admin/customers');
    }
  };
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-[14px] text-ink">
      <p>
        You are acting as <strong>{user?.email}</strong>. This session ends after an hour and every action is recorded.
      </p>
      <button
        type="button"
        onClick={() => void back()}
        disabled={busy}
        className="min-h-10 rounded-full bg-s3 px-4 text-[13.5px] font-semibold text-ink hover:bg-s4 focus-visible:outline-2 focus-visible:outline-acc disabled:opacity-60"
      >
        {busy ? 'Returning…' : 'Return to admin'}
      </button>
    </div>
  );
}

function Guard({ area, children }: { area: 'customer' | 'admin'; children: ReactNode }) {
  const { user, loading, staffTwoFactorRequired } = useSession();
  const { navigate, path, search } = useRouter();

  // The redirect is an effect and not a part of the render: a side effect in
  // the render runs twice under StrictMode and leaves a broken page behind.
  useEffect(() => {
    if (loading || user) return;
    // Replace and not push, so the back button does not return to a page that
    // needs a session.
    navigate(loginRedirect(path, search), { replace: true });
  }, [loading, user, navigate, path, search]);

  if (loading || !user) {
    // The page is never shown without a session, not even for one frame.
    return (
      <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6">
        <LoadingBlock rows={4} label="Checking your session" />
      </div>
    );
  }

  if (area === 'admin' && isStaff(user.role) && staffTwoFactorRequired) {
    return (
      <div className="mx-auto w-full max-w-[640px] px-4 py-16 sm:px-6">
        <div className="grid gap-4 rounded-2xl border border-line bg-card p-6">
          <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-ink">Turn on two-factor authentication</h1>
          <p className="text-[14.5px] text-ink2">The staff area requires two-factor authentication. Set it up in your security settings (an authenticator app or a passkey), then come back.</p>
          <div><Link to="/app/settings?tab=security" className="inline-flex min-h-11 items-center rounded-full bg-acc px-5 text-[14.5px] font-semibold text-on-acc">Open the security settings</Link></div>
        </div>
      </div>
    );
  }

  if (area === 'admin' && !isStaff(user.role)) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6">
        <ErrorState
          title="Staff access only"
          message="Your account does not have permission to open the admin area."
          onRetry={() => navigate('/app')}
        />
        <p className="mt-4 px-1 text-[14px] text-ink2">
          <Link to="/app" className="font-bold text-acc hover:underline">
            Back to your dashboard
          </Link>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * The guard of the two routes that only make sense without a session.
 *
 * While the session is being checked the form is not shown: the visitor never
 * sees a form that disappears a moment later. Once the session is known, the
 * visitor is sent to the page of their role, or to the page they asked for
 * when that page is one their role is allowed to open.
 *
 * The session is read once. A session that appears later comes from an action
 * on the page itself, and the page decides where it goes: the register form
 * keeps its "check your email" screen instead of being taken away.
 */
function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const { navigate, query } = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (loading || settled.current) return;
    settled.current = true;
    if (user) setTarget(postLoginTarget(user.role, query.next));
  }, [loading, user, query.next]);

  useEffect(() => {
    if (!target) return;
    navigate(target, { replace: true });
  }, [target, navigate]);

  if (loading || target) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6">
        <LoadingBlock rows={2} label="Checking your session" />
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * The action of the bar of the customer area.
 *
 * The bar offers what the customer most likely does on the page they are on, and nothing
 * on a page where the action would repeat a button of the page itself. A phone has the
 * round Deploy button in its bottom bar, so the bar shows nothing there.
 */
function contextAction(path: string): { to: string; label: string; icon: 'rocket' | 'plus' } | null {
  if (path === '/app') return { to: '/app/deploy', label: 'Deploy', icon: 'rocket' };
  if (path === '/app/instances') return { to: '/app/deploy', label: 'New instance', icon: 'plus' };
  if (path === '/app/vps') return { to: '/app/vps/new', label: 'New server', icon: 'plus' };
  if (path === '/app/domains') return { to: '/app/domains/new', label: 'Add domain', icon: 'plus' };
  if (path === '/app/mail') return { to: '/app/mail/domains/new', label: 'Add domain', icon: 'plus' };
  if (path === '/app/tickets') return { to: '/app/tickets/new', label: 'New ticket', icon: 'plus' };
  return null;
}

function ShellAction({ path }: { path: string }) {
  const action = contextAction(path);
  if (!action) return null;
  return (
    <Link
      to={action.to}
      aria-label={action.label}
      className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-acc px-3 text-[13.5px] font-medium text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:px-4"
    >
      <Icon name={action.icon} size={15} />
      <span className="max-sm:sr-only">{action.label}</span>
    </Link>
  );
}

/** The page of the servers was first called /app/servers by some links: they land on the page of the servers. */
function ServersRedirect() {
  const { id } = useParams();
  const { navigate } = useRouter();
  useEffect(() => {
    navigate(id ? `/app/vps/${encodeURIComponent(id)}` : '/app/vps', { replace: true });
  }, [navigate, id]);
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6">
      <LoadingBlock rows={2} label="Opening your servers" />
    </div>
  );
}

/** The waiting of a page that is fetched when it is opened. */
function Waiting({ label }: { label: string }) {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-[max(20px,env(safe-area-inset-left))] py-10 sm:px-8">
      <LoadingBlock rows={3} label={label} />
    </div>
  );
}

/**
 * The head of a page of the public site.
 *
 * The page that is written to the disk carries its own head. The browser
 * keeps it right when the visitor moves to another page without a load.
 */
function SiteHead({ path }: { path: string }) {
  return (
    <Suspense fallback={null}>
      <Head path={path} />
    </Suspense>
  );
}

/** The title of a page of the dashboard. */
function Title({ title }: { title: string }) {
  useEffect(() => {
    document.title = `${title} · Blipmade`;
  }, [title]);
  return null;
}

/**
 * The pages of the public site.
 *
 * The pages that are written to the disk and the pages the browser draws are
 * the same pages: the address decides which one it is, and the address is read
 * by `matchPublic`, which both sides use.
 */
function PublicSite({ match }: { match: PublicMatch }) {
  switch (match.kind) {
    case 'home':
      return (
        <Page>
          <Home />
        </Page>
      );
    case 'apps':
      return (
        <Page>
          <Apps />
        </Page>
      );
    case 'app':
      return (
        <Page>
          <AppDetail slug={match.param ?? ''} />
        </Page>
      );
    case 'docs':
      return (
        <Page>
          <Suspense fallback={<Waiting label="Opening the documentation" />}>
            <DocsIndex />
          </Suspense>
        </Page>
      );
    case 'doc':
      return (
        <Page>
          <Suspense fallback={<Waiting label="Opening the page" />}>
            <DocsArticle id={match.param ?? ''} />
          </Suspense>
        </Page>
      );
    case 'legal':
      return (
        <Page>
          <Suspense fallback={<Waiting label="Opening the page" />}>
            <LegalPage slug={match.param ?? ''} />
          </Suspense>
        </Page>
      );
    // The five screens of the account carry their own frame: they are a page
    // of their own, with the panel of the platform on the side.
    case 'login':
      return <AuthLogin />;
    case 'register':
      return <AuthRegister />;
    case 'forgot':
      return <AuthForgot />;
    case 'reset':
      return <AuthReset />;
    case 'verify':
      return <AuthVerify />;
    default:
      return <NotFound />;
  }
}

export default function AppRoutes() {
  const { path, query, navigate } = useRouter();

  // The documentation was named with a question in the address
  // (`/docs?p=upgrade`). The site names a page with a part of the address
  // (`/docs/upgrade`). An address that was kept from before is sent to the
  // page it names, and it is not kept in the history of the browser.
  useEffect(() => {
    if (path !== '/docs' || !query.p) return;
    navigate(`/docs/${encodeURIComponent(query.p)}`, { replace: true });
  }, [path, query.p, navigate]);

  const match = matchPublic(path);
  if (match.kind !== 'notfound') {
    const page = <PublicSite match={match} />;
    return (
      <>
        <SiteHead path={path} />
        {match.guestOnly ? <GuestOnly>{page}</GuestOnly> : page}
        <Suspense fallback={null}>
          <GuestChatWidget />
        </Suspense>
      </>
    );
  }

  for (const route of ROUTES) {
    const params = matchPath(route.pattern, path);
    if (!params) continue;
    const Page = route.component;
    const content = (
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6">
            <LoadingBlock rows={3} />
          </div>
        }
      >
        <ParamsProvider value={params}>
          <Page />
        </ParamsProvider>
      </Suspense>
    );

    if (!route.area) {
      return (
        <>
          <Title title={route.title} />
          {content}
        </>
      );
    }

    const nav = route.area === 'admin' ? ADMIN_NAV : CUSTOMER_NAV;
    const tabs = route.area === 'admin' ? ADMIN_PHONE_TABS : CUSTOMER_PHONE_TABS;

    return (
      <Guard area={route.area}>
        <Title title={route.title} />
        <AppShell
          nav={nav}
          phoneTabs={tabs}
          groups={route.area === 'admin' ? ADMIN_GROUPS : CUSTOMER_GROUPS}
          title={route.title}
          subtitle={route.subtitle}
          layout={route.layout}
          servicePages={route.area === 'customer' ? CUSTOMER_SERVICE_PAGES : undefined}
          environment={route.area === 'admin' ? 'Staff · Production' : undefined}
          actions={route.area === 'customer' ? <ShellAction path={path} /> : undefined}
        >
          {route.area === 'customer' && <ImpersonationBanner />}
          {route.area === 'customer' && <AnnouncementBanner />}
          {content}
          {/* A dedicated editor has its own actions at the bottom, so the chat button does not float over them. */}
          {route.area === 'customer' && route.layout !== 'editor' && (
            <Suspense fallback={null}>
              <ChatWidget />
            </Suspense>
          )}
        </AppShell>
      </Guard>
    );
  }

  return (
    <>
      <SiteHead path={path} />
      <NotFound />
    </>
  );
}
