import { Suspense, lazy, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { AppShell, ErrorState, LoadingBlock } from './ui-app';
import { ADMIN_NAV, ADMIN_PHONE_TABS, CUSTOMER_NAV, CUSTOMER_PHONE_TABS } from './nav';
import { useSession } from './session';
import { ParamsProvider, matchPath, useParams, useRouter } from './router';
import { Link } from './router';
import { isStaff, loginRedirect, postLoginTarget } from './auth-guard';
import { Icon } from './icons';

// The marketing homepage stays in the main bundle. Everything else is split so
// the public site does not pay for the dashboard.
import Home from './pages/Home';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const Docs = lazy(() => import('./pages/Docs'));
const Status = lazy(() => import('./pages/Status'));
const NotFound = lazy(() => import('./pages/NotFound'));

// The legal pages are text, and they are read by the people who want to
// know what the platform is. They are split like the rest of the pages,
// so a visitor who only wants the catalogue does not pay for them.
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Cookies = lazy(() => import('./pages/Cookies'));
const Aup = lazy(() => import('./pages/Aup'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy'));
const Sla = lazy(() => import('./pages/Sla'));
const ServerError = lazy(() => import('./pages/ServerError'));

const AppOverview = lazy(() => import('./app/Overview'));
const AppInstances = lazy(() => import('./app/Instances'));
const AppInstanceDetail = lazy(() => import('./app/InstanceDetail'));
const AppDeployCatalog = lazy(() => import('./app/DeployCatalog'));
const AppDeploy = lazy(() => import('./app/Deploy'));
const AppDomains = lazy(() => import('./app/Domains'));
const AppMail = lazy(() => import('./app/Mail'));
const EmailStorefront = lazy(() => import('./app/EmailHosting'));
const EmailCheckout = lazy(() => import('./app/EmailHosting').then((module) => ({ default: module.EmailCheckout })));
const AppBilling = lazy(() => import('./app/Billing'));
const AppTickets = lazy(() => import('./app/Tickets'));
const AppTicketDetail = lazy(() => import('./app/TicketDetail'));
const AppSettings = lazy(() => import('./app/Settings'));
const AppNotifications = lazy(() => import('./app/Notifications'));

// The page of a product and the catalog are public: a visitor reads them
// without an account and only the deploy action asks for one.
const ProductPage = lazy(() => import('./app/ProductPage'));
const CatalogIndex = lazy(() => import('./app/ProductPage').then((m) => ({ default: m.CatalogIndex })));

const AdminOverview = lazy(() => import('./admin/Overview'));
const AdminCustomers = lazy(() => import('./admin/Customers'));
const AdminCustomerDetail = lazy(() => import('./admin/CustomerDetail'));
const AdminOrders = lazy(() => import('./admin/Orders'));
const AdminServices = lazy(() => import('./admin/Services'));
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
  /** The route is only shown to a visitor without a session. */
  guestOnly?: boolean;
}

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

export const ROUTES: RouteDef[] = [
  { pattern: '/login', component: Login, title: 'Log in', guestOnly: true },
  { pattern: '/register', component: Register, title: 'Create account', guestOnly: true },
  { pattern: '/forgot-password', component: ForgotPassword, title: 'Reset password' },
  { pattern: '/reset-password', component: ResetPassword, title: 'Choose a new password' },
  { pattern: '/verify-email', component: VerifyEmail, title: 'Verify email' },
  { pattern: '/docs', component: Docs, title: 'Documentation' },
  { pattern: '/status', component: Status, title: 'Service status' },
  { pattern: '/apps', component: CatalogIndex, title: 'Catalog' },
  // The storefront of the hosted mail. It is public: a visitor reads the
  // limits of the plans before he makes an account.
  { pattern: '/email', component: EmailStorefront, title: 'Hosted mail' },
  { pattern: '/apps/:slug', component: ProductPage, title: 'Product' },
  { pattern: '/deploy/:slug', component: DeployRedirect, title: 'Deploy' },

  // The legal pages. They are public: a visitor reads them without an
  // account, and the footer of the site links to all of them.
  { pattern: '/terms', component: Terms, title: 'Terms of service' },
  { pattern: '/privacy', component: Privacy, title: 'Privacy policy' },
  { pattern: '/cookies', component: Cookies, title: 'Cookie policy' },
  { pattern: '/aup', component: Aup, title: 'Acceptable use policy' },
  { pattern: '/refund-policy', component: RefundPolicy, title: 'Refund policy' },
  { pattern: '/sla', component: Sla, title: 'Service levels' },

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
  { pattern: '/app/email/checkout', component: EmailCheckout, title: 'Hosted mail', area: 'customer' },
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
  { pattern: '/admin/products', component: AdminProducts, title: 'Catalog', area: 'admin' },
  { pattern: '/admin/pricing', component: AdminPricing, title: 'Pricing', area: 'admin' },
  { pattern: '/admin/tickets', component: AdminTickets, title: 'Support queue', area: 'admin' },
  { pattern: '/admin/promotions', component: AdminPromotions, title: 'Promotions', area: 'admin' },
  { pattern: '/admin/infrastructure', component: AdminInfrastructure, title: 'Infrastructure', area: 'admin' },
  { pattern: '/admin/ops', component: AdminOps, title: 'Operations', area: 'admin' },
  { pattern: '/admin/mail', component: AdminMail, title: 'Mail', area: 'admin' },
  { pattern: '/admin/mail/plans', component: AdminMailPlans, title: 'Mail plans', area: 'admin' },
  { pattern: '/admin/audit', component: AdminAudit, title: 'Audit log', area: 'admin' },
  { pattern: '/admin/staff', component: AdminStaff, title: 'Staff & permissions', area: 'admin' },
  { pattern: '/admin/settings', component: AdminSettings, title: 'Settings', area: 'admin' },
  { pattern: '/admin/notifications', component: AdminEmailNotifications, title: 'Email & notifications', area: 'admin' },
];

function Guard({ area, children }: { area: 'customer' | 'admin'; children: ReactNode }) {
  const { user, loading } = useSession();
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
 * Deploying is the thing a customer comes to do, so the way to the catalog of
 * products is always one press away, on a phone as well as on a desktop.
 */
function DeployAction() {
  return (
    <Link
      to="/app/deploy"
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-acc px-4 text-[13.5px] font-medium text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <Icon name="rocket" size={15} />
      Deploy
    </Link>
  );
}

export default function AppRoutes() {  const { path } = useRouter();

  if (path === '/' || path === '') return <Home />;

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

    if (route.guestOnly) return <GuestOnly>{content}</GuestOnly>;
    if (!route.area) return content;

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
          actions={route.area === 'customer' ? <DeployAction /> : undefined}
        >
          {content}
        </AppShell>
      </Guard>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6">
          <LoadingBlock rows={2} />
        </div>
      }
    >
      <NotFound />
    </Suspense>
  );
}
