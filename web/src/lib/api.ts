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
 *
 * The code of the answer tells the two cases apart: a session that ended and
 * an account that was suspended. The customer is told which one it is,
 * because "you were disconnected" and "your account was suspended" are two
 * very different things.
 */
type UnauthorizedHandler = (code: string) => void;
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
    if (response.status === 401 && !UNAUTHORIZED_IS_ANSWER.some((p) => path === p || path.startsWith(`${p}?`))) {
      // The session is gone. The page that needs it will send the visitor to
      // the login, with the page they wanted. The code is read first, so the
      // handler can tell an account that was suspended from a session that
      // simply ended.
      unauthorizedHandler?.(code);
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

/**
 * One session of the account, as the API sends it.
 */
export interface AccountSession {
  id: string;
  ip: string | null;
  userAgent: string | null;
  /** The name of the browser and of the device of the session. */
  device: string;
  /** The moment the session was opened. */
  createdAt: string;
  /** The moment the session was last used. Null when it was never used again. */
  lastSeenAt: string | null;
  /** The moment the session ends by itself. */
  expiresAt: string;
  /** True when this session is the one the request was made with. */
  current: boolean;
}

/**
 * The date and the hour of a moment.
 */
export function formatMoment(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'an unknown moment';
  return date.toLocaleString('en-IE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * A moment in the past, written in words.
 */
export function relativeTime(value: string | null, now: number = Date.now()): string {
  if (!value) return 'not known';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return 'not known';
  const seconds = Math.round((now - time) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * The last activity of a session, in words.
 */
export function sessionActivity(session: Pick<AccountSession, 'lastSeenAt'>, now: number = Date.now()): string {
  if (!session.lastSeenAt) return 'no activity recorded';
  return `active ${relativeTime(session.lastSeenAt, now)}`;
}

/**
 * The line of a session in the list: the address, the moment of the sign-in
 * and the last activity of the session.
 */
/**
 * An address that fits a line.
 *
 * An IPv4 address is short and stays whole. An IPv6 address has eight groups,
 * so the middle is left out: the first groups tell the network and the last one
 * tells the device.
 */
export function shortAddress(ip: string | null): string {
  if (!ip) return 'Unknown address';
  if (!ip.includes(':') || ip.length <= 20) return ip;
  const groups = ip.split(':');
  return groups.length > 4 ? `${groups.slice(0, 3).join(':')}:…:${groups[groups.length - 1]}` : ip;
}

export function sessionSummary(session: AccountSession, now: number = Date.now()): string {
  const address = shortAddress(session.ip);
  return `${address} · signed in on ${formatMoment(session.createdAt)} · ${sessionActivity(session, now)}`;
}

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
  | 'starting'
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
 * The rate card of the platform, in minor units, for a month.
 *
 * The card is one card for every product of a server: the price of a
 * gigabyte of memory, the price of a processor, the price of a gigabyte of
 * disk and the fee of the instance itself.
 */
export interface ResourceRates {
  ramPerGb: number;
  cpuPerUnit: number;
  diskPerGb: number;
  baseFee: number;
}

/**
 * The price of a configuration, broken down into what it is made of.
 *
 * The parts add up to the total, so the customer sees a breakdown that adds
 * up. The prices are in minor units.
 */
export interface ResourceBreakdown {
  ram: number;
  cpu: number;
  disk: number;
  base: number;
  options: number;
  total: number;
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
    /**
     * The card of the platform that prices this product.
     *
     * The page shows the parts of the price with it, and the server recalculates
     * the same numbers: the price of an order is never derived on the client.
     */
    rates?: ResourceRates;
    /** The parts of the price of the two configurations of the book. */
    breakdown?: { minimum: ResourceBreakdown; recommended: ResourceBreakdown };
  } | null;
  /** Whether the product can be ordered, and why not. */
  availability: DeploymentAvailability;
  options: ProductOption[];
  /**
   * The variables the customer has to fill at the order, such as the licence
   * of a game. A product that asks for nothing has none.
   */
  customerVariables: Record<string, CustomerVariableSpec>;
}

/** What a product says about one variable the customer fills. */
export interface CustomerVariableSpec {
  label: string;
  required: boolean;
  type: 'text' | 'password';
  description?: string;
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
  /** The parts of the price of the line. Null for a line of mail. */
  breakdown?: ResourceBreakdown | null;
  /** What the line delivers: a server on a node, or a mail service. */
  fulfilment?: string;
}

/**
 * The tax of the invoice.
 *
 * The platform adds the tax to the invoices it writes itself. The rate is the
 * one the operator wrote in the settings, and the tax is only added when
 * there is a rate and a tax identifier: the note says why it is zero.
 */
export interface QuoteTax {
  /** The rate of the tax, as a percentage. Null when none is configured. */
  rate: number | null;
  /** The tax of the quote, in minor units. */
  amount: number;
  /** Whether the tax is added to the invoice. */
  applies: boolean;
  /** Why the tax is zero, when it is. */
  note: string | null;
  /** The quote and its tax. */
  total: number;
}

export interface Quote {
  items: QuoteItem[];
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
  /**
   * The period of the prices in this quote. The order that follows takes the
   * same period, so the sum that was shown is the sum that is charged.
   */
  period: 'MONTHLY' | 'YEARLY';
  /**
   * The promotion of the quote. It is null when the customer did not type a
   * code: an empty field is not a wrong code, so it never carries an error.
   */
  promotion: { code: string; valid: boolean; reason?: string } | null;
  /** The tax that the invoice of this quote carries. */
  tax?: QuoteTax;
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
  /**
   * What the node said about the container of this instance.
   *
   * The state is the one of the node, in the words of the node. It is stale
   * when the node could not be asked: the last known state is kept and the
   * customer is told that it is not fresh any more.
   */
  runtime: {
    state: string | null;
    condition: 'serving' | 'starting' | 'stopped' | null;
    checkedAt: string | null;
    stale: boolean;
  };
  product: { slug: string; name: string; icon: string };
  ram: number;
  cpu: number;
  disk: number;
  price: number;
  currency: string;
  url: string | null;
  createdAt: string;
  node: { name: string } | null;
  /** Whether this service has a password that the platform made for it. */
  credentials: boolean;
  subscription: { status: string; currentPeriodEnd: string | null } | null;
}

export interface Domain {
  id: string;
  instanceId: string;
  instanceName: string;
  hostname: string;
  status: 'pending_dns' | 'pending_gateway' | 'verifying' | 'active' | 'error';
  targetPort: number;
  dnsRecords: { name: string; type: string; value: string }[];
  lastError: string | null;
  /** An address of the platform: it needs no DNS record and no proof, and its name may change. */
  platform?: boolean;
  /** The moment the name of an address of the platform may change again. Null when it may change now. */
  addressChangeAvailableAt?: string | null;
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
  /** What the ticket is about: a server or a mail service. */
  serviceName?: string | null;
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

export interface BillingAddress {
  fullName: string;
  companyName: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  taxId: string;
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
  billingAddress: BillingAddress | null;
  /** What the invoice is for, from its order. Empty when the invoice has no order. */
  lines?: { name: string; quantity: number; unitAmount: number; total: number }[];
  createdAt: string;
  periodStart: string | null;
  periodEnd: string | null;
}

/** The company that issues the invoices, as the operator wrote it in the settings. A missing value is empty. */
export interface InvoiceCompany {
  name: string;
  registration: string;
  taxId: string;
  taxRate: number | null;
  address: string;
  supportEmail: string;
  taxApplies: boolean;
  taxNote: string | null;
}

export interface Subscription {
  id: string;
  instanceId: string | null;
  /** What the subscription pays for, and the id of that service. */
  serviceKind?: 'server' | 'mail' | 'vps' | null;
  serviceId?: string | null;
  instanceName: string | null;
  status: string;
  amount: number;
  currency: string;
  currentPeriodEnd: string | null;
  stripeManaged?: boolean;
  cancelAtPeriodEnd: boolean;
}

// --- mail -----------------------------------------------------------------

/**
 * An email domain of the customer.
 *
 * The server sends the whole picture of a domain, so the page never has to
 * count the mailboxes and the aliases by itself.
 */
export interface MailDomainView {
  id: string;
  /** The hostname the customer owns, for example acme.ro. */
  name: string;
  status: 'pending' | 'active' | 'error' | 'suspended';
  /** The space of the whole domain, in megabytes. */
  quotaMb: number;
  /** The space the domain uses, in megabytes. */
  usedMb: number;
  maxMailboxes: number;
  maxAliases: number;
  /** How many mailboxes the domain has. */
  mailboxes: number;
  /** How many aliases the domain has. */
  aliases: number;
  /** The public key of DKIM, when the server has one for the domain. */
  dkimPublic: string | null;
  /** The webmail of the customer, when there is one. */
  webmailUrl: string | null;
  lastError: string | null;
  createdAt: string;
}

/** A mailbox of a domain. */
export interface MailboxView {
  id: string;
  /** The address of the mailbox, for example contact@acme.ro. */
  address: string;
  status: 'active' | 'disabled';
  quotaMb: number;
  usedMb: number;
  /**
   * The password of the mailbox. It is only in the answer that creates the
   * mailbox, and only when the server made the password itself.
   */
  password?: string;
  createdAt: string;
}

/** An alias: another address that reaches a mailbox. */
export interface MailAliasView {
  id: string;
  /** The address of the alias, for example info@acme.ro. */
  alias: string;
  /** The mailbox that receives the mail of the alias. */
  target: string;
  createdAt: string;
}

/** A DNS record the customer has to publish for the mail to work. */
export interface DnsRecordView {
  name: string;
  type: 'MX' | 'TXT' | 'CNAME';
  value: string;
  priority?: number;
  /** What the record is for, in words: where the mail is delivered. */
  purpose: string;
}

/** What the server found for one record when it looked it up. */
export interface DnsCheckResult {
  name: string;
  type: string;
  /** True when the record is published with the value the platform expects. */
  ok: boolean;
  /** The values the world answers for that name, up to three. */
  found: string[];
}

/** The email domains of the customer. */
export const listMailDomains = (signal?: AbortSignal) =>
  get<{ domains: MailDomainView[] }>('/mail/domains', undefined, signal);

/** One email domain, with its counters. */
export const getMailDomain = (id: string, signal?: AbortSignal) =>
  get<{ domain: MailDomainView }>(`/mail/domains/${id}`, undefined, signal);

/** Adds an email domain. The server answers with the domain it created. */
export const createMailDomain = (name: string) => post<{ domain: MailDomainView }>('/mail/domains', { name });

/** Deletes an email domain with everything it holds. */
export const deleteMailDomain = (id: string) => del<{ ok: true }>(`/mail/domains/${id}`);

/** The mailboxes of a domain. */
export const listMailboxes = (domainId: string, signal?: AbortSignal) =>
  get<{ mailboxes: MailboxView[] }>(`/mail/domains/${domainId}/mailboxes`, undefined, signal);

/**
 * Adds a mailbox to a domain.
 *
 * Without a password the server makes one and sends it back. That answer is
 * the only time the password is ever seen.
 */
export const createMailbox = (domainId: string, body: { localPart: string; password?: string }) =>
  post<{ mailbox: MailboxView }>(`/mail/domains/${domainId}/mailboxes`, body);

/** Deletes a mailbox of a domain. */
export const deleteMailbox = (domainId: string, mailboxId: string) =>
  del<{ ok: true }>(`/mail/domains/${domainId}/mailboxes/${mailboxId}`);

/** The aliases of a domain. */
export const listMailAliases = (domainId: string, signal?: AbortSignal) =>
  get<{ aliases: MailAliasView[] }>(`/mail/domains/${domainId}/aliases`, undefined, signal);

/** Adds an alias that reaches a mailbox of the domain. */
export const createMailAlias = (domainId: string, body: { alias: string; target: string }) =>
  post<{ alias: MailAliasView }>(`/mail/domains/${domainId}/aliases`, body);

/** Deletes an alias of a domain. */
export const deleteMailAlias = (domainId: string, aliasId: string) =>
  del<{ ok: true }>(`/mail/domains/${domainId}/aliases/${aliasId}`);

/**
 * The DNS records the customer has to publish for a domain, and whether the
 * server has seen them already.
 */
export const getMailDns = (domainId: string, signal?: AbortSignal) =>
  get<{ records: DnsRecordView[]; verified: boolean; results?: DnsCheckResult[] }>(`/mail/domains/${domainId}/dns`, undefined, signal);

// --- admin mail ------------------------------------------------------------

/** The state of a hosted mail domain, as the API sends it. */
export type AdminMailDomainStatus = 'pending' | 'active' | 'error' | 'suspended';

/** The state of a job of the mail. */
export type AdminMailJobStatus = 'queued' | 'running' | 'done' | 'failed';

/**
 * The health of the mail system and of the platform.
 *
 * `consistent` is null when the mail system could not be reached: there is
 * nothing to compare then, so the page must not say that the two sides hold
 * the same numbers.
 */
export interface AdminMailHealth {
  service: {
    /** Whether this environment points at a mail system at all. */
    configured: boolean;
    /** Whether the mail system answered the request. */
    reachable: boolean;
    /** The version the mail system reports. */
    version: string | null;
    /** The disk of the mail system. Null when the mail system did not answer. */
    disk: { used: string; total: string; usedPercent: string } | null;
    /** The words of the failure, when there is one. */
    error: string | null;
  };
  /** What the platform believes it holds. */
  platform: { domains: number; mailboxes: number; aliases: number; failedJobs: number };
  /** What the mail system holds. Zero when the mail system did not answer. */
  system: { domains: number; mailboxes: number; aliases: number };
  /** True when the two sides hold the same numbers, false when they do not. */
  consistent: boolean | null;
}

/** A hosted mail domain, with the customer that owns it. */
export interface AdminMailDomain {
  id: string;
  /** The hostname the customer owns, for example acme.ro. */
  name: string;
  status: AdminMailDomainStatus;
  /** The space of the whole domain, in megabytes. */
  quotaMb: number;
  /** The space the domain uses, in megabytes. */
  usedMb: number;
  /** How many mailboxes the domain has. */
  mailboxes: number;
  /** How many aliases the domain has. */
  aliases: number;
  /** The words of the last failure, when there is one. */
  lastError: string | null;
  /** The customer that owns the domain. */
  customer: { id: string; email: string };
  createdAt: string;
  updatedAt: string;
}

/** A job the platform owes to the mail system. */
export interface AdminMailJob {
  id: string;
  /** The work itself, for example mailbox.create. */
  kind: string;
  status: AdminMailJobStatus;
  /** How many times the work was tried. */
  attempts: number;
  /** The words of the last failure, when there is one. */
  lastError: string | null;
  /** True only for a failed job whose kind can be repeated. */
  retryable: boolean;
  /** The domain the work belongs to. Null when it belongs to none. */
  domain: { id: string; name: string } | null;
  /** What the work carries. */
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** The page of a list that is walked with a cursor. */
export interface AdminMailPagination {
  limit: number;
  /** The cursor of the next page. Null when there is no next page. */
  nextCursor: string | null;
  hasMore: boolean;
}

/** The query of a list of the mail. */
export interface AdminMailListQuery {
  limit?: number;
  cursor?: string;
  status?: string;
  search?: string;
}

/** The health of the mail system and of the platform. */
export const getAdminMailHealth = (signal?: AbortSignal) =>
  get<AdminMailHealth>('/admin/mail/health', undefined, signal);

/** Every hosted mail domain of every customer, in pages. */
export const listAdminMailDomains = (query: AdminMailListQuery = {}, signal?: AbortSignal) =>
  get<{ domains: AdminMailDomain[]; total: number; pagination: AdminMailPagination }>(
    '/admin/mail/domains',
    { limit: query.limit, cursor: query.cursor, status: query.status, search: query.search },
    signal,
  );

/** The work the platform owes to the mail system, in pages. */
export const listAdminMailJobs = (query: AdminMailListQuery = {}, signal?: AbortSignal) =>
  get<{ jobs: AdminMailJob[]; total: number; pagination: AdminMailPagination }>(
    '/admin/mail/jobs',
    { limit: query.limit, cursor: query.cursor, status: query.status },
    signal,
  );

/**
 * Repeats a job of the mail that failed.
 *
 * The server refuses the work it cannot repeat, and the words of the refusal
 * are the ones the page shows.
 */
export const retryAdminMailJob = (id: string) =>
  post<{ job: AdminMailJob }>(`/admin/mail/jobs/${encodeURIComponent(id)}/retry`);

// --- mail commerce --------------------------------------------------------

/**
 * The limits of a plan of hosted mail.
 *
 * Every limit is a number of the platform: the interface reads them and never
 * writes one of them down.
 */
export interface MailPlanLimits {
  /** How many domains the plan includes. */
  maxDomains: number;
  /** How many mailboxes a domain of the plan may hold. */
  maxMailboxes: number;
  /** How many aliases a domain of the plan may hold. */
  maxAliases: number;
  /** How many forwarding rules a domain of the plan may hold. */
  maxForwarding: number;
  /** The space of the whole plan, in megabytes. */
  totalStorageMb: number;
  /** The space of one mailbox, in megabytes. */
  mailboxQuotaMb: number;
  /** How many messages may be sent in the window of the interval. */
  sendLimit: number;
  /** The window in which the limit of sending is counted. */
  sendInterval: string;
}

/**
 * A price of a plan of hosted mail, in minor units of its currency.
 *
 * The period says how often the amount is charged.
 */
export interface MailPlanPrice {
  amount: number;
  currency: string;
  period: string;
}

/**
 * Whether a plan of hosted mail can be bought, and why not when it cannot.
 *
 * The blockers are the words of the platform: they are shown to the customer
 * as they are.
 */
export interface MailPlanAvailability {
  /** The state of the plan, seen from the outside. */
  state: string;
  /** True when the plan can be ordered right now. */
  orderable: boolean;
  /** Why the plan cannot be ordered. Empty when it can. */
  blockers: string[];
}

/**
 * A plan of hosted mail, as the public catalog of the platform sends it.
 *
 * The price is null when the plan has no price yet, and `onSale` is false
 * when the operator closed the sale of hosted mail. A plan that is not on sale
 * can still be read, it cannot be bought.
 */
export interface MailPlanView {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  limits: MailPlanLimits;
  /** The price of the plan, or null when it has none yet. */
  price: MailPlanPrice | null;
  /** Every price of the plan, one per period. */
  prices: MailPlanPrice[];
  availability: MailPlanAvailability;
  /** True when the sale of hosted mail is open for this plan. */
  onSale: boolean;
}

/**
 * The state of a mail service.
 *
 * A service is what a customer buys when they buy hosted mail. It has its own
 * life: it waits for its domain, it is set up, it works, it may fall into a
 * grace period, it may be suspended and it may be cancelled.
 */
export type MailServiceStatus =
  | 'PENDING'
  | 'PROVISIONING'
  | 'ACTIVE'
  | 'GRACE'
  | 'SUSPENDED'
  | 'CANCELLED';

/**
 * The state of the proof of ownership of a domain.
 *
 * The proof is a record of DNS that the customer publishes: the platform never
 * writes the DNS of a customer.
 */
export type MailOwnershipStatus = 'UNVERIFIED' | 'VERIFIED' | 'FAILED';

/**
 * A domain of a mail service, with its state and its proof.
 */
export interface MailServiceDomainView {
  id: string;
  /** The hostname the customer owns, for example acme.ro. */
  name: string;
  status: string;
  /** The state of the proof of ownership of the domain. */
  ownershipStatus: MailOwnershipStatus;
  /** The record of DNS that carries the proof. */
  verificationHost: string | null;
  /** The token the customer has to publish. */
  verificationToken: string | null;
  /** The moment the proof was accepted. */
  verifiedAt: string | null;
  /** The space of the domain, in megabytes. */
  quotaMb: number;
  /** The space the domain uses, in megabytes. */
  usedMb: number;
  /** How many mailboxes the domain has. */
  mailboxCount: number;
  /** How many aliases the domain has. */
  aliasCount: number;
  maxMailboxes: number;
  maxAliases: number;
  maxForwarding: number;
  /** The words of the last failure, when there is one. */
  lastError: string | null;
  /** The webmail of the customer, when the platform gives one. */
  webmailUrl?: string | null;
}

/**
 * A mail service of the customer: the plan that was paid for, the use of it
 * and the domains it holds.
 */
export interface MailServiceView {
  id: string;
  status: MailServiceStatus;
  plan: { slug: string; name: string; category: string };
  limits: MailPlanLimits;
  usage: {
    /** How many domains the service holds. */
    domains: number;
    /** How many mailboxes the service holds. */
    mailboxes: number;
    /** The space the service uses, in megabytes. */
    storageMb: number;
    /** The space of the plan, in megabytes. */
    storageLimitMb: number;
  };
  domains: MailServiceDomainView[];
  /** The moment the grace period ends. */
  graceUntil: string | null;
  /** The moment the service was suspended. */
  suspendedAt: string | null;
  /** The moment the service was cancelled. */
  cancelledAt: string | null;
  /** The moment the data of the service is deleted. */
  retentionUntil: string | null;
  /** The words of the last failure, when there is one. */
  lastError: string | null;
  createdAt: string;
  /** The webmail of the customer, when the platform gives one. */
  webmailUrl?: string | null;
}

/**
 * A line of an order that buys hosted mail.
 *
 * A line of mail names the domain it brings and no resources: the plan of the
 * line is the whole configuration.
 */
export interface MailPlanOrder {
  productSlug: string;
  mailDomain: string;
}

/** A record of DNS of a domain of a mail service. */
export interface MailServiceDnsRecordView {
  name: string;
  type: string;
  value: string;
  priority?: number;
  /** What the record is for, in words. */
  purpose?: string;
}

/**
 * The records of DNS of a domain of a mail service, and what the server has
 * seen of them.
 */
export interface MailServiceDnsView {
  id: string;
  name: string;
  records: MailServiceDnsRecordView[];
  /** True when the server has seen the records of the domain. */
  verified: boolean;
  /** The records the server has not seen yet. */
  missing?: string[] | boolean;
}

// --- notification centre ---------------------------------------------------

/**
 * The groups of the messages of the notification centre.
 *
 * The keys are the groups of the preferences: a group of the interface is a
 * group of the server, so the page never invents a group of its own.
 */
export type NotificationGroupKey =
  | 'accountSecurity'
  | 'ordersBilling'
  | 'hostingServices'
  | 'support'
  | 'domainsEmail'
  | 'incidents'
  | 'productUpdates'
  | 'marketing';

/**
 * The channel a message travels on.
 *
 * The e-mail goes to the address of the account, the notification centre is
 * the page of the dashboard.
 */
export type NotificationChannel = 'email' | 'in_app';

/**
 * One message of the notification centre.
 *
 * The message belongs to the customer of the session that reads it. The
 * server never sends the message of another customer, so the interface does
 * not have to hide anything: there is nothing of another customer to see.
 */
export interface NotificationView {
  id: string;
  /** The group of the message, one of the keys of the preferences. */
  category: string;
  title: string;
  body: string;
  /** The page the message leads to: the service, the invoice, the ticket. */
  actionUrl: string | null;
  /** The words of the link of the action. */
  actionLabel: string | null;
  /** The moment the message was read. Null when it was not read yet. */
  readAt: string | null;
  /** The moment the message happened. */
  createdAt: string;
}

/**
 * What the customer chose to hear about.
 *
 * The essential group is not a choice: the server keeps it on whatever the
 * customer sends. `billing` is the switch of the old platform, kept so a
 * customer who turned it off keeps that choice.
 */
export interface NotificationPreferences {
  accountSecurity: boolean;
  ordersBilling: boolean;
  billing: boolean;
  hostingServices: boolean;
  support: boolean;
  domainsEmail: boolean;
  incidents: boolean;
  productUpdates: boolean;
  marketing: boolean;
  emailChannel: boolean;
  inAppChannel: boolean;
}

/**
 * A group of messages, as the customer reads it.
 */
export interface NotificationCategoryView {
  key: string;
  label: string;
  description: string;
  /** essential | optional | marketing */
  classification: string;
  /** True when the customer may not switch the group off. */
  essential: boolean;
  /** The channels the group travels on. */
  channels: NotificationChannel[];
}

/**
 * The answer of the list of the notifications.
 */
export interface NotificationListResponse {
  notifications: NotificationView[];
  /** How many messages of the customer are waiting to be read. */
  unread: number;
  /** The cursor of the next page. Null when there is no next page. */
  nextCursor: string | null;
}

/**
 * The answer of the preferences: what the customer chose and the groups of
 * the messages, in the order the server gives them.
 */
export interface NotificationPreferencesResponse {
  preferences: NotificationPreferences;
  categories: NotificationCategoryView[];
}


// --- virtual private servers ------------------------------------------------

/** A plan of a virtual private server, as the platform sells it. */
export interface VpsPlanView {
  slug: string;
  name: string;
  description: string;
  ram: number;
  cpu: number;
  disk: number;
  price: { amount: number; currency: string; period: string } | null;
  /** The address of its own, when one can be bought. */
  dedicatedIp: { code: string; amount: number } | null;
}

/** A virtual private server of the customer. */
/** What a server uses right now, as the hypervisor reports it. */
export interface VpsUsageView {
  power: 'running' | 'stopped';
  uptimeSeconds: number;
  cpuPercent: number;
  cpus: number;
  memoryUsed: number;
  memoryTotal: number;
  networkIn: number;
  networkOut: number;
  diskRead: number;
  diskWritten: number;
}

export interface VpsServerView {
  id: string;
  name: string;
  status: string;
  power: 'running' | 'stopped' | 'unknown';
  plan: { slug: string; name: string };
  ram: number;
  cpu: number;
  disk: number;
  publicIp: string | null;
  sshPort: number | null;
  dedicatedIp: boolean;
  image?: { slug: string; label: string };
  sshCommand: string | null;
  lastError: string | null;
  createdAt: string;
}


/** The summary of what the account pays, as the API makes it from every subscription. */
export interface AccountBillingSummary {
  currency: string;
  /** The monthly total in `currency`, in cents. */
  monthlyEstimate: number;
  /** One total for each currency: amounts in different currencies are never added. */
  monthlyByCurrency?: { currency: string; amount: number }[];
  /** The nearest renewal that costs something. */
  nextRenewal?: { at: string; amount: number; currency: string; subscriptionId: string } | null;
  subscriptions: Subscription[];
}
