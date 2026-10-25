import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Load .env from the repository root or the api directory, whichever exists.
loadEnv({ path: ['.env', '../.env'] });

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3100),
  /**
   * The number of sign-in attempts that may fail on one account, and on one
   * address, before the sign-in is refused for a quarter of an hour.
   *
   * Only the attempts that failed are counted: a sign-in that worked does not
   * count, so a customer who signs in several times in a row is never locked
   * out of their own account.
   */
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(10),
  WORKER_HEALTH_PORT: z.coerce.number().default(3101),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),

  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  APP_ORIGIN: z.string().default('http://localhost:5173'),
  APP_PUBLIC_URL: z.string().default('http://localhost:5173'),
  /** "true", "false" or unset. Unset means the cookie follows the origin. */
  COOKIE_SECURE: z.string().optional(),

  PTERODACTYL_URL: z.string().default(''),
  /** The administrative key of the panel. It never reaches the browser. */
  PTERODACTYL_APP_KEY: z.string().default(''),
  /**
   * The endpoint of the panel that issues a client key for one customer.
   * It is the bridge that the panel carries, and it is the only way to get a
   * credential that is scoped to a single customer. See docs/PANEL_BRIDGE.md.
   */
  PANEL_KEYMINT_URL: z.string().default(''),
  /** The secret of the bridge. Both sides sign with it. */
  PANEL_KEYMINT_SECRET: z.string().default(''),

  /**
   * The addresses of the nodes that can be reached from here.
   *
   * The panel answers with the address of a node as it is known on the
   * internet. That address is not always the one that can be reached from
   * this server, and the console of a server is opened on that address. The
   * value is a list of pairs, separated by commas, where the first one is the
   * address the panel uses and the second one the address that works here:
   *
   *     PANEL_NODE_ADDRESSES=node1.example.com:8080=10.0.0.11:8080
   *
   * The name of the node is kept for the certificate of the connection, so the
   * certificate of the node stays the one that is checked.
   */
  PANEL_NODE_ADDRESSES: z.string().default(''),

  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_PUBLISHABLE_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  /**
   * Stripe Tax calculates the tax of a checkout at the provider.
   *
   * It is off unless the operator turns it on. With it off, a checkout carries
   * exactly the sum of the order and the tax stays the one of the company
   * settings of the platform. With it on, the provider calculates the tax and
   * the platform records the tax that was really charged, next to the sum of
   * the order. A tax is never invented in either case: the number that is
   * written down is always the number the provider charged.
   */
  STRIPE_TAX_ENABLED: bool(false),

  SMTP_URL: z.string().default(''),
  /**
   * The certificate that the relay of the platform is allowed to be signed by.
   *
   * A relay that is signed by an authority the machine trusts needs nothing:
   * the empty value is the right value. A relay of the platform itself, whose
   * name is not published in the DNS yet, is signed by nobody, and the
   * certificate of the relay is the one that says that it is the right one.
   *
   * The value is the path of a file that holds the certificate in the format
   * of PEM. A file that cannot be read is an error and not a relay without a
   * certificate.
   */
  SMTP_CA_FILE: z.string().default(''),
  MAIL_FROM: z.string().default('Blipmade <no-reply@blipmade.com>'),
  /** The inbox that receives the notifications about new support tickets. */
  MAIL_SUPPORT_EMAIL: z.string().default('support@blipmade.com'),
  /**
   * The public origin of the site. Every link that leaves the system, in an
   * email or in a checkout, is built from it. Nothing is ever derived from
   * the host of the request, so a link can never point at a local address.
   */
  PUBLIC_WEB_URL: z.string().default('https://blipmade.com'),
  /**
   * Payments are only possible when the operator turns them on and a Stripe
   * key is present. Until then the checkout says that it is not available,
   * instead of pretending that it works.
   */
  PAYMENTS_ENABLED: bool(false),

  INTERNAL_API_TOKEN: z.string().default(''),
  BLIPMADE_INTERNAL_API_TOKEN: z.string().default(''),
  ADMIN_ENROLLMENT_KEY: z.string().default(''),

  BACKUP_DIR: z.string().default('/var/backups/blipmade'),
  /** Where the files attached to support tickets are stored. */
  ATTACHMENT_DIR: z.string().default('/data/uploads'),
  DOMAIN_BASE: z.string().default(''),
  CADDY_ADMIN_URL: z.string().default(''),
  CADDY_ADMIN_TOKEN: z.string().default(''),
  /**
   * The server of Caddy that holds the routes of the customer domains.
   *
   * The routes live in a namespace of their own, so the routes of the
   * operator are never read, replaced or removed. The name of that server is
   * configurable, because a Caddy that serves the platform on the same
   * addresses may already have a server of its own, and a server that cannot
   * listen on the same address is easier to point at than to create.
   */
  CADDY_APP_SERVER: z.string().default('blipmade'),
  METRICS_ENABLED: bool(true),
  LOG_LEVEL: z.string().default('info'),

  /**
   * The mail system that holds the mailboxes of the customers.
   *
   * The address is the administrative API of the system, over HTTPS. The
   * certificate of a mail system that is not published in the DNS yet is
   * signed by nobody, so the fingerprint of the certificate is what the
   * platform checks: the address alone would not prove anything.
   */
  MAILCOW_API_URL: z.string().default(''),
  MAILCOW_API_KEY: z.string().default(''),
  /**
   * The SHA-256 of the certificate of the mail system, in lower case hex.
   *
   * It is empty when the certificate of the mail system is signed by an
   * authority the machine already trusts.
   */
  MAILCOW_API_CERT_SHA256: z.string().default(''),
  /** The name of the machine of the mail system, e.g. "mail.blipmade.com". */
  MAIL_HOSTNAME: z.string().default('mail.blipmade.com'),
  /** Where the customer reads the mail of a customer domain. */
  MAIL_WEBMAIL_URL: z.string().default(''),
  /**
   * The mailbox that receives the reports of DMARC.
   *
   * It is a bare address and not the `MAIL_FROM` of the platform, which may
   * carry a display name ("Blipmade <no-reply@blipmade.com>"), and a name
   * cannot go into a record of DNS.
   */
  MAIL_RUA_ADDRESS: z.string().default('postmaster@blipmade.com'),
  /** How many domains of mail a customer may host. */
  MAIL_MAX_DOMAINS_PER_CUSTOMER: z.coerce.number().int().min(0).max(1000).default(3),
  /** How many mailboxes a domain of mail may hold. */
  MAIL_MAX_MAILBOXES_PER_DOMAIN: z.coerce.number().int().min(0).max(10000).default(10),
  /** How many aliases a domain of mail may hold. */
  MAIL_MAX_ALIASES_PER_DOMAIN: z.coerce.number().int().min(0).max(10000).default(100),
  /** How much mail a mailbox may hold, in megabytes. */
  MAIL_MAX_QUOTA_MB_PER_MAILBOX: z.coerce.number().int().min(1).max(1024000).default(1024),
  /** How much mail a domain of mail may hold, in megabytes. */
  MAIL_MAX_QUOTA_MB_PER_DOMAIN: z.coerce.number().int().min(1).max(1024000).default(10240),

  /**
   * The addresses that are allowed to set the forwarding headers. Only these
   * are trusted, so a client cannot forge its own address and slip past the
   * rate limit.
   *
   * The default believes the loopback and nothing else. The private range of
   * the container network is NOT believed by default: every container in it
   * could set the header and write an address of its own choosing into the
   * session and into the journal (SEC-05). The operator sets here the
   * address of the web container, which is the only one that reaches the API.
   *
   * An entry is an address or a block of addresses, written as
   * `172.16.0.0/12`, the same way the web container reads its own list of
   * proxies. The operator has to set this to the address of the web container
   * or to the range of the container network, in the environment of the API
   * container. Without it the API reads the address of the web container for
   * every request: the session cookie is issued without the Secure attribute
   * and every visitor of the platform shares one counter of the rate limit.
   */
  TRUSTED_PROXIES: z.string().default('127.0.0.1,::1'),

  /** Where the worker serves its own health endpoint. */
  WORKER_URL: z.string().default('http://worker:3101'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  internalToken: raw.INTERNAL_API_TOKEN || raw.BLIPMADE_INTERNAL_API_TOKEN,
  /**
   * The session and CSRF cookies are only marked Secure when they are actually
   * served over HTTPS. The setting follows the public origin, so a staging
   * environment on plain HTTP still works, while the production origin keeps
   * the cookies protected.
   */
  cookieSecure:
    raw.COOKIE_SECURE === 'true'
      ? true
      : raw.COOKIE_SECURE === 'false'
        ? false
        : raw.APP_ORIGIN.startsWith('https://'),
  // The limit of the sign-in attempts. It is configurable because an
  // environment that shares one address (a test stack, an office) needs a
  // different limit than one where every customer has its own address.
  loginRateLimitMax: raw.LOGIN_RATE_LIMIT_MAX,
  stripeEnabled: raw.STRIPE_SECRET_KEY.startsWith('sk_'),
  /**
   * True when the tax of a checkout is calculated by Stripe. It is off by
   * default, so the platform never charges a tax nobody configured.
   */
  stripeTaxEnabled: raw.STRIPE_TAX_ENABLED,
  /**
   * The origin every outward link is built from, without a trailing slash.
   */
  publicWebUrl: raw.PUBLIC_WEB_URL.replace(/\/+$/, ''),
  /**
   * True when a checkout can actually be started: payments are turned on and
   * a Stripe key is configured.
   */
  paymentsEnabled: raw.PAYMENTS_ENABLED && raw.STRIPE_SECRET_KEY.startsWith('sk_'),
  mailEnabled: Boolean(raw.SMTP_URL),
  pterodactylEnabled: Boolean(raw.PTERODACTYL_URL && raw.PTERODACTYL_APP_KEY),
  /**
   * True when the panel can issue a client key on request. Without it no
   * customer operation is possible, because the client API refuses the
   * administrative key.
   */
  panelBridgeEnabled: Boolean(raw.PTERODACTYL_URL && raw.PANEL_KEYMINT_URL && raw.PANEL_KEYMINT_SECRET),
  /** The proxy addresses the API believes when it reads the forwarding headers. */
  trustProxies: raw.TRUSTED_PROXIES.split(',')
    .map((value) => value.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;
