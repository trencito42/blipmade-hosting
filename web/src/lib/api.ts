/**
 * Typed client for the Blipmade API.
 *
 * The API is same-origin under /api. The session cookie is HttpOnly, so every
 * request is sent with credentials and CSRF is carried in a readable cookie
 * that is echoed back in the X-CSRF-Token header.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
  }
}

export function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : undefined;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Called when the API answers that the session is not valid any more.
 *
 * The session can end while the page is open: the cookie expires, the account
 * is suspended, or the session is revoked from another device. The pages that
 * need a session have to know about it, so the handler clears the session and
 * the guard sends the visitor to the login.
 */
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function onUnauthorized(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

/** The paths where a 401 is an answer, not the end of a session. */
const UNAUTHORIZED_IS_ANSWER = ['/auth/session', '/auth/login', '/auth/register', '/auth/logout'];

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = { method, credentials: 'include', headers, signal: options.signal };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  if (!SAFE_METHODS.has(method)) {
    const csrf = readCookie('bm_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), init);
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the Blipmade API. Check your connection and retry.');
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  const requestId = response.headers.get('x-request-id') ?? undefined;

  if (!response.ok) {
    if (response.status === 401 && !UNAUTHORIZED_IS_ANSWER.some((p) => path === p || path.startsWith(`${p}?`))) {
      // The session is gone. The page that needs it will send the visitor to
      // the login, with the page they wanted.
      unauthorizedHandler?.();
    }
    let code = 'request_failed';
    let message = `Request failed (${response.status}).`;
    let fields: Record<string, string> | undefined;
    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null);
      const detail = payload?.error ?? payload;
      if (detail && typeof detail === 'object') {
        if (typeof detail.code === 'string') code = detail.code;
        if (typeof detail.message === 'string') message = detail.message;
        if (detail.fields && typeof detail.fields === 'object') fields = detail.fields as Record<string, string>;
      } else if (typeof detail === 'string') {
        message = detail;
      }
    }
    throw new ApiError(response.status, code, message, fields, requestId);
  }

  if (!contentType.includes('application/json')) return undefined as T;
  return (await response.json()) as T;
}

export const get = <T,>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
  api<T>(path, { method: 'GET', query, signal });

export const post = <T,>(path: string, body?: unknown, query?: RequestOptions['query']) =>
  api<T>(path, { method: 'POST', body, query });

export const put = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body });

export const patch = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body });

export const del = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });

// --- shared shapes -------------------------------------------------------

export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';

export interface SessionUser {
  id: string;
  email: string;
  /** The two parts of the name of the customer. Both are always present. */
  firstName: string;
  lastName: string;
  /** The two parts as one line, for the places that show a single name. */
  name: string;
  role: Role;
  emailVerified: boolean;
  /** Staff permissions granted to this account. Empty for customers. */
  permissions: string[];
}

export type InstanceStatus =
  | 'pending'
  | 'provisioning'
  | 'online'
  | 'restarting'
  | 'stopped'
  | 'degraded'
  | 'failed'
  | 'suspended'
  | 'cancelled';

export interface ProductOption {
  code: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
}

/**
 * A configuration of a product and what it costs.
 *
 * The catalog sends the minimum configuration (the starting price of the
 * catalog) and the recommended one, both priced by the server with the same
 * function that prices an order.
 */
export interface PricedConfiguration {
  ram: number;
  cpu: number;
  disk: number;
  amount: number;
}

/**
 * What the catalog and the ordering know about a product.
 *
 * `state` is the answer that counts: a product that is listed and priced but
 * that the panel cannot build is not orderable.
 */
export interface DeploymentAvailability {
  /** The state of the product, seen from the outside. */
  state: 'DEPLOYABLE' | 'COMING_SOON' | 'TEMPORARILY_UNAVAILABLE' | 'UNPUBLISHED';
  enabled: boolean;
  installable: boolean;
  visible: boolean;
  orderable: boolean;
  blockers: string[];
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  minRam: number;
  minCpu: number;
  minDisk: number;
  defaultRam: number;
  defaultCpu: number;
  defaultDisk: number;
  maxRam: number;
  maxCpu: number;
  maxDisk: number;
  visible: boolean;
  deployable: boolean;
  eggId: number | null;
  docsUrl: string | null;
  price: { amount: number; currency: string; period: string } | null;
  /** The price book of the product. Null when it has no active price. */
  pricing: {
    currency: string;
    period: string;
    minimum: PricedConfiguration;
    recommended: PricedConfiguration;
  } | null;
  /** Whether the product can be ordered, and why not. */
  availability: DeploymentAvailability;
  options: ProductOption[];
}

export interface QuoteItem {
  productSlug: string;
  name: string;
  ram: number;
  cpu: number;
  disk: number;
  optionCodes: string[];
  quantity: number;
  unitAmount: number;
  total: number;
  currency: string;
}

export interface Quote {
  items: QuoteItem[];
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
  /**
   * The promotion of the quote. It is null when the customer did not type a
   * code: an empty field is not a wrong code, so it never carries an error.
   */
  promotion: { code: string; valid: boolean; reason?: string } | null;
}

export interface OrderItem {
  id: string;
  name: string;
  productSlug: string;
  quantity: number;
  unitAmount: number;
  total: number;
  config: { ram: number; cpu: number; disk: number; optionCodes: string[] } | null;
}

export interface Order {
  id: string;
  number: string;
  status: string;
  total: number;
  discount: number;
  currency: string;
  createdAt: string;
  items: OrderItem[];
}

export interface Instance {
  id: string;
  name: string;
  status: InstanceStatus;
  product: { slug: string; name: string; icon: string };
  ram: number;
  cpu: number;
  disk: number;
  price: number;
  currency: string;
  url: string | null;
  createdAt: string;
  node: { name: string } | null;
  subscription: { status: string; currentPeriodEnd: string | null } | null;
}

export interface Domain {
  id: string;
  instanceId: string;
  instanceName: string;
  hostname: string;
  status: 'pending_dns' | 'verifying' | 'active' | 'error';
  targetPort: number;
  dnsRecords: { name: string; type: string; value: string }[];
  lastError: string | null;
  /**
   * The proof of ownership. The customer has to publish a TXT record with the
   * token before the hostname is routed.
   */
  verification: {
    host: string | null;
    token: string | null;
    verified: boolean;
    verifiedAt: string | null;
    expiresAt: string | null;
    instructions: string | null;
  };
}

export interface Ticket {
  id: string;
  number: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  instanceId: string | null;
  instanceName: string | null;
  createdAt: string;
  updatedAt: string;
  lastReplyAt: string | null;
  assignedTo: string | null;
  messageCount: number;
}

export interface TicketMessage {
  id: string;
  body: string;
  internal: boolean;
  author: { id: string; name: string | null; role: Role };
  createdAt: string;
  attachments: { name: string; size: number; type: string }[];
}

export interface Invoice {
  id: string;
  number: string;
  status: string;
  amount: number;
  tax: number;
  total: number;
  currency: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
  createdAt: string;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface Subscription {
  id: string;
  instanceId: string | null;
  instanceName: string | null;
  status: string;
  amount: number;
  currency: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}
