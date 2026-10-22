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

export const del = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });

// --- shared shapes -------------------------------------------------------

export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  emailVerified: boolean;
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
  docsUrl: string | null;
  price: { amount: number; currency: string; period: string } | null;
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
  promotion?: { code: string; valid: boolean; reason?: string };
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
