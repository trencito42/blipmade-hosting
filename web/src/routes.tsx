import { Suspense, lazy, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { AppShell, ErrorState, LoadingBlock } from './ui-app';
import { ADMIN_NAV, ADMIN_PHONE_TABS, CUSTOMER_NAV, CUSTOMER_PHONE_TABS } from './nav';
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
const AppDeployCatalog = lazy(() => import('./app/DeployCatalog'));
const AppDeploy = lazy(() => import('./app/Deploy'));
const AppDomains = lazy(() => import('./app/Domains'));
const AppMail = lazy(() => import('./app/Mail'));
const EmailStorefront = lazy(() => import('./app/EmailHosting'));
const VpsStorefront = lazy(() => import('./app/Vps'));
const VpsCheckout = lazy(() => import('./app/Vps').then((module) => ({ default: module.VpsCheckout })));
const VpsList = lazy(() => import('./app/Vps').then((module) => ({ default: module.VpsList })));
const VpsDetail = lazy(() => import('./app/Vps').then((module) => ({ default: module.VpsDetail })));
const EmailCheckout = lazy(() => import('./app/EmailHosting').then((module) => ({ default: module.EmailCheckout })));
const AppBilling = lazy(() => import('./app/Billing'));
const AppTickets = lazy(() => import('./app/Tickets'));
const AppTicketDetail = lazy(() => import('./app/TicketDetail'));
const AppSettings = lazy(() => import('./app/Settings'));
const AppNotifications = lazy(() => import('./app/Notifications'));

const InvoiceView = lazy(() => import('./app/InvoiceView'));
const AdminIncidents = lazy(() => import('./admin/Incidents'));
const AdminReports = lazy(() => import('./admin/Reports'));
const AdminQueues = lazy(() => import('./admin/Queues'));
const AdminAbuse = lazy(() => import('./admin/Abuse'));
const ReportAbusePage = lazy(() => import('./pages/ReportAbuse'));
const AdminEmailTemplates = lazy(() => import('./admin/EmailTemplates'));
const AdminOverview = lazy(() => import('./admin/Overview'));
const AdminCustomers = lazy(() => import('./admin/Customers'));
const AdminCustomerDetail = lazy(() => import('./admin/CustomerDetail'));
const AdminOrders = lazy(() => import('./admin/Orders'));
const AdminServices = lazy(() => import('./admin/Services'));
const AdminVps = lazy(() => import('./admin/Vps'));
const AdminProducts = lazy(() => import('./admin/Products'));
const AdminPricing = lazy(() => import('./admin/Pricing'));
const AdminTickets = lazy(() => import('./admin/Tickets'));
const AdminPromotions = lazy(() => import('./admin/Promotions'));
const AdminInfrastructure = lazy(() => import('./admin/Infrastructure'));
const AdminOps = lazy(() => import('./admin/Ops'));
const AdminMail = lazy(() => import('./admin/Mail'));
const AdminMailPlans = lazy(() => import('./admin/MailProducts'));
const AdminAudit = lazy(() => import('./admin/Audit'));
const AdminStaff = lazy(() => import('./admin/Staff'));
const AdminSettings = lazy(() => import('./admin/Settings'));
const AdminEmailNotifications = lazy(() => import('./admin/EmailNotifications'));

interface RouteDef {
  pattern: string;
  component: ComponentType;
  title: string;
  subtitle?: string;
  area?: 'customer' | 'admin';
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
  { pattern: '/app/instances/:id', component: AppInstanceDetail, title: 'Instance', area: 'customer' },
  { pattern: '/app/deploy', component: AppDeployCatalog, title: 'Deploy', area: 'customer', exact: true },
  { pattern: '/app/deploy/:slug', component: AppDeploy, title: 'Deploy', area: 'customer' },
  { pattern: '/app/domains', component: AppDomains, title: 'Domains', area: 'customer' },
  { pattern: '/app/mail', component: AppMail, title: 'Email', area: 'customer' },
  { pattern: '/app/servers', component: ServersRedirect, title: 'Servers', area: 'customer', exact: true },
  { pattern: '/app/servers/:id', component: ServersRedirect, title: 'Servers', area: 'customer' },
  { pattern: '/app/vps', component: VpsList, title: 'Servers', area: 'customer', exact: true },
  { pattern: '/app/vps/new', component: VpsCheckout, title: 'New server', area: 'customer' },
  { pattern: '/app/vps/:id', component: VpsDetail, title: 'Server', area: 'customer' },
  { pattern: '/app/email/checkout', component: EmailCheckout, title: 'Hosted mail', area: 'customer' },
  { pattern: '/app/billing/invoices/:id', component: InvoiceView, title: 'Invoice', area: 'customer' },
  { pattern: '/app/billing', component: AppBilling, title: 'Billing', area: 'customer' },
  { pattern: '/app/tickets', component: AppTickets, title: 'Support', area: 'customer' },
  { pattern: '/app/tickets/:id', component: AppTicketDetail, title: 'Ticket', area: 'customer' },
  { pattern: '/app/settings', component: AppSettings, title: 'Settings', area: 'customer' },
  { pattern: '/app/notifications', component: AppNotifications, title: 'Notifications', area: 'customer' },

  { pattern: '/admin', component: AdminOverview, title: 'Dashboard', area: 'admin', exact: true },
  { pattern: '/admin/customers', component: AdminCustomers, title: 'Customers', area: 'admin' },
  { pattern: '/admin/customers/:id', component: AdminCustomerDetail, title: 'Customer', area: 'admin' },
  { pattern: '/admin/orders', component: AdminOrders, title: 'Orders', area: 'admin' },
  { pattern: '/admin/services', component: AdminServices, title: 'Services', area: 'admin' },
  { pattern: '/admin/vps', component: AdminVps, title: 'Servers', area: 'admin' },
  { pattern: '/admin/products', component: AdminProducts, title: 'Catalog', area: 'admin' },
  { pattern: '/admin/pricing', component: AdminPricing, title: 'Pricing', area: 'admin' },
  { pattern: '/admin/tickets', component: AdminTickets, title: 'Support queue', area: 'admin' },
  { pattern: '/admin/promotions', component: AdminPromotions, title: 'Promotions', area: 'admin' },
  { pattern: '/admin/infrastructure', component: AdminInfrastructure, title: 'Infrastructure', area: 'admin' },
  { pattern: '/admin/incidents', component: AdminIncidents, title: 'Incidents', area: 'admin' },
  { pattern: '/admin/reports', component: AdminReports, title: 'Reports', area: 'admin' },
  { pattern: '/admin/queues', component: AdminQueues, title: 'Job queues', area: 'admin' },
  { pattern: '/admin/abuse', component: AdminAbuse, title: 'Abuse reports', area: 'admin' },
  { pattern: '/admin/ops', component: AdminOps, title: 'Operations', area: 'admin' },
  { pattern: '/admin/mail', component: AdminMail, title: 'Mail', area: 'admin' },
  { pattern: '/admin/mail/plans', component: AdminMailPlans, title: 'Mail plans', area: 'admin' },
  { pattern: '/admin/audit', component: AdminAudit, title: 'Audit log', area: 'admin' },
  { pattern: '/admin/staff', component: AdminStaff, title: 'Staff & permissions', area: 'admin' },
  { pattern: '/admin/settings', component: AdminSettings, title: 'Settings', area: 'admin' },
  { pattern: '/admin/email-templates', component: AdminEmailTemplates, title: 'Email wording', area: 'admin' },
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
  return null;
}

function ShellAction({ path }: { path: string }) {
  const action = contextAction(path);
  if (!action) return null;
  return (
    <Link
      to={action.to}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-acc px-4 text-[13.5px] max-lg:hidden font-medium text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <Icon name={action.icon} size={15} />
      {action.label}
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
        <AppShell
          nav={nav}
          phoneTabs={tabs}
          title={route.title}
          subtitle={route.subtitle}
          environment={route.area === 'admin' ? 'Staff · Production' : undefined}
          actions={route.area === 'customer' ? <ShellAction path={path} /> : undefined}
        >
          {route.area === 'customer' && <ImpersonationBanner />}
          {route.area === 'customer' && <AnnouncementBanner />}
          {content}
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
