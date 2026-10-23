import { Suspense, lazy, useEffect, type ComponentType, type ReactNode } from 'react';
import { AppShell, ErrorState, LoadingBlock } from './ui-app';
import { ADMIN_NAV, ADMIN_PHONE_TABS, CUSTOMER_NAV, CUSTOMER_PHONE_TABS } from './nav';
import { useSession } from './session';
import { ParamsProvider, matchPath, useParams, useRouter } from './router';
import { Link } from './router';

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

const AppOverview = lazy(() => import('./app/Overview'));
const AppInstances = lazy(() => import('./app/Instances'));
const AppInstanceDetail = lazy(() => import('./app/InstanceDetail'));
const AppDeploy = lazy(() => import('./app/Deploy'));
const AppDomains = lazy(() => import('./app/Domains'));
const AppBilling = lazy(() => import('./app/Billing'));
const AppTickets = lazy(() => import('./app/Tickets'));
const AppTicketDetail = lazy(() => import('./app/TicketDetail'));
const AppSettings = lazy(() => import('./app/Settings'));

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
const AdminAudit = lazy(() => import('./admin/Audit'));
const AdminStaff = lazy(() => import('./admin/Staff'));
const AdminSettings = lazy(() => import('./admin/Settings'));

interface RouteDef {
  pattern: string;
  component: ComponentType;
  title: string;
  subtitle?: string;
  area?: 'customer' | 'admin';
  exact?: boolean;
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

const ROUTES: RouteDef[] = [
  { pattern: '/login', component: Login, title: 'Log in' },
  { pattern: '/register', component: Register, title: 'Create account' },
  { pattern: '/forgot-password', component: ForgotPassword, title: 'Reset password' },
  { pattern: '/reset-password', component: ResetPassword, title: 'Choose a new password' },
  { pattern: '/verify-email', component: VerifyEmail, title: 'Verify email' },
  { pattern: '/docs', component: Docs, title: 'Documentation' },
  { pattern: '/status', component: Status, title: 'Service status' },
  { pattern: '/apps', component: CatalogIndex, title: 'Catalog' },
  { pattern: '/apps/:slug', component: ProductPage, title: 'Product' },
  { pattern: '/deploy/:slug', component: DeployRedirect, title: 'Deploy' },

  { pattern: '/app', component: AppOverview, title: 'Overview', area: 'customer', exact: true },
  { pattern: '/app/instances', component: AppInstances, title: 'Apps & databases', area: 'customer' },
  { pattern: '/app/instances/:id', component: AppInstanceDetail, title: 'Instance', area: 'customer' },
  { pattern: '/app/deploy/:slug', component: AppDeploy, title: 'Deploy', area: 'customer' },
  { pattern: '/app/domains', component: AppDomains, title: 'Domains', area: 'customer' },
  { pattern: '/app/billing', component: AppBilling, title: 'Billing', area: 'customer' },
  { pattern: '/app/tickets', component: AppTickets, title: 'Support', area: 'customer' },
  { pattern: '/app/tickets/:id', component: AppTicketDetail, title: 'Ticket', area: 'customer' },
  { pattern: '/app/settings', component: AppSettings, title: 'Settings', area: 'customer' },

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
  { pattern: '/admin/audit', component: AdminAudit, title: 'Audit log', area: 'admin' },
  { pattern: '/admin/staff', component: AdminStaff, title: 'Staff & permissions', area: 'admin' },
  { pattern: '/admin/settings', component: AdminSettings, title: 'Settings', area: 'admin' },
];

function Guard({ area, children }: { area: 'customer' | 'admin'; children: ReactNode }) {
  const { user, loading } = useSession();
  const { navigate } = useRouter();

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6">
        <LoadingBlock rows={4} label="Checking your session" />
      </div>
    );
  }

  if (!user) {
    // Replace rather than push so the back button does not return to a guarded page.
    navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
    return null;
  }

  if (area === 'admin' && user.role !== 'STAFF' && user.role !== 'ADMIN') {
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

export default function AppRoutes() {
  const { path } = useRouter();

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
