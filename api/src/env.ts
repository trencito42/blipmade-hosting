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
  /** Separate key for reversible customer credentials. Set before migrating v1 blobs. */
  DATA_ENCRYPTION_SECRET: z.string().default('').refine((value) => value.length === 0 || value.length >= 32, 'DATA_ENCRYPTION_SECRET must be at least 32 characters'),
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
  /** Exact HTTPS host:port allowlist for server-side Wings backup/file downloads. */
  PTERODACTYL_DOWNLOAD_HOSTS: z.string().default(''),

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
  /** Require a real card for an order fully covered by a promotion. */
  PROMOTION_CARD_CHECK_ENABLED: bool(false),
  /** HMAC key used to pseudonymise Stripe card fingerprints in the database. */
  PROMOTION_FINGERPRINT_SECRET: z.string().default(''),
  /** Comma-separated domains that may not create customer accounts. */
  DISPOSABLE_EMAIL_DOMAINS: z.string().default(''),

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
  /**
   * The name of the sender, when it is not the one of `MAIL_FROM`.
   *
   * The platform sends with one authorized identity: the address of the
   * platform in Mailcow. The name is only the label that the customer sees
   * next to the address.
   */
  MAIL_SENDER_NAME: z.string().default('Blipmade'),
  /**
   * The address the answers go to.
   *
   * It is empty by default: an empty value means the answers go back to the
   * sender, which is the safe choice when the operator has not chosen one.
   */
  MAIL_REPLY_TO: z.string().default(''),
  /** The inbox that receives the notifications about new support tickets. */
  MAIL_SUPPORT_EMAIL: z.string().default('support@blipmade.com'),
  /**
   * The inbox that receives the alerts about the operation of the platform.
   *
   * It is the address of the operator, and it is not the one of the mail
   * system, so the alert still arrives when the mail system is the thing
   * that is broken.
   */
  MAIL_OPERATOR_EMAIL: z.string().default(''),
  /**
   * The address that receives the messages about the payments of the
   * platform, when the operator wants them apart from the support.
   */
  MAIL_BILLING_EMAIL: z.string().default(''),
  /**
   * How long the platform waits for the relay, in milliseconds.
   */
  SMTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
  /**
   * How many messages the platform sends to the relay in one minute.
   *
   * The throttle protects the relay from a flood: a burst of events is
   * spread over the minute instead of being pushed at once.
   */
  SMTP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10000).default(120),
  /**
   * The address the customer may write to when something is wrong with the
   * messages of the platform. It is empty when there is none.
   */
  MAIL_HELP_EMAIL: z.string().default(''),
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
   * Whether the mail of the platform is on sale.
   *
   * It is closed by default: the mail is not sold until the operator has
   * proved the payment, the mail system, the DNS, the backup and the
   * delivery from end to end. The switch is closed here and nowhere else,
   * so the catalog, the quote and the order all refuse the same way.
   */
  MAIL_SALES_ENABLED: z
    .string()
    .default('false')
    .transform((value) => value.trim().toLowerCase() === 'true')
    .pipe(z.boolean()),
  /**
   * How many days a mail service keeps working after it stops being paid
   * for. The period of grace is the time the customer has to pay; the mail
   * is not suspended before it ends.
   */
  MAIL_GRACE_PERIOD_DAYS: z.coerce.number().int().min(0).max(365).default(14),
  /**
   * How many days the data of a mail service is kept after it was
   * suspended. The data is never deleted the moment a payment fails: it is
   * kept for the whole retention, so it can be recovered.
   */
  MAIL_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  /** How many forwarding rules a domain of mail may hold. */
  MAIL_MAX_FORWARDING_PER_DOMAIN: z.coerce.number().int().min(0).max(10000).default(10),
  /**
   * The most messages a domain may send in the window of the plan, whatever
   * the plan says. The limit of the platform is the ceiling of the limit of
   * the plan.
   */
  MAIL_MAX_SEND_LIMIT: z.coerce.number().int().min(1).max(1000000).default(500),

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

  /**
   * The directory in which the state of the operations is written: the
   * receipts of the backups, the incident that the operator declares and the
   * journal of the alarms.
   *
   * The path is the same on the host and inside the containers, so the
   * platform reads what the scripts of the host have written and the
   * operator reads what the platform has written. The path of the host is
   * the default; the containers get theirs from the compose file, because
   * the directory is mounted into them.
   */
  OPS_STATUS_DIR: z.string().default('/var/backups/blipmade/status'),
  /**
   * Where the journal of the alarms is written.
   *
   * It is empty by default, and then the journal lives next to the other
   * state of the operations. The journal is the channel that does not depend
   * on the mail server: it is a file on the host, and it is read by the
   * dashboard of the operations.
   */
  OPS_ALERT_LOG: z.string().default(''),
  /**
   * The address that receives the alarms of the platform on a channel that
   * has nothing to do with the mail of the platform: a chat room, a service
   * of incidents, a script of the operator.
   *
   * It is empty when the operator did not write one down. The platform then
   * says so in the dashboard, because an alarm that can only leave the host
   * by the mail of the platform cannot tell anybody that the mail of the
   * platform is down.
   */
  OPS_ALERT_WEBHOOK_URL: z.string().default(''),
  /**
   * The key with which the alarm is signed before it is pushed to the
   * address of the operator, so the operator can tell that it comes from
   * the platform.
   */
  OPS_ALERT_WEBHOOK_SECRET: z.string().default(''),
  /**
   * The webhook of the Discord channel of the operator.
   *
   * Discord does not take the body of the platform, so the channel has an
   * adapter of its own: the message is built as an embed, with the severity,
   * the component and the name of the occurrence.
   *
   * The address carries the token that lets anybody write in the channel of
   * the operator, so it is never written in a log, never shown in the
   * dashboard and never sent in an answer.
   */
  OPS_DISCORD_WEBHOOK_URL: z.string().default(''),
  /**
   * The file that holds the webhook of the Discord channel.
   *
   * The address is a secret, and a secret that is written in the environment
   * of the platform travels with every copy of the configuration. A file that
   * only the owner of the platform can read keeps it in one place, and the
   * file is read when the channel is needed.
   */
  OPS_DISCORD_WEBHOOK_FILE: z.string().default(''),
  /**
   * How many minutes a provisioning may last before the service is said to
   * be stuck.
   */
  OPS_STUCK_MINUTES: z.coerce.number().int().min(1).max(10080).default(20),
  /**
   * How old a backup may be before it is a failure. The backup of the night
   * is 26 hours old when the next one runs, so the limit leaves room for
   * one night to be missed.
   */
  OPS_BACKUP_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(8760).default(30),
  /**
   * How old the copy that leaves the host may be before it is said to be
   * missing.
   */
  OPS_OFFSITE_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(8760).default(30),
  /**
   * How many days a certificate may still have before it is said to be a
   * problem.
   */
  OPS_CERT_MIN_DAYS: z.coerce.number().int().min(1).max(365).default(21),
  /**
   * The share of the disk that is a problem.
   */
  OPS_DISK_MAX_PERCENT: z.coerce.number().int().min(1).max(100).default(85),
  /**
   * The share of the memory that is a problem.
   */
  OPS_MEMORY_MAX_PERCENT: z.coerce.number().int().min(1).max(100).default(90),
  /**
   * How many alarms may leave the platform in an hour. A platform that breaks
   * in many places at once must not become a flood of alarms.
   */
  OPS_ALERT_MAX_PER_HOUR: z.coerce.number().int().min(1).max(200).default(5),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const raw = parsed.data;

if (raw.PROMOTION_CARD_CHECK_ENABLED) {
  if (!raw.STRIPE_SECRET_KEY.startsWith('sk_')) {
    throw new Error('PROMOTION_CARD_CHECK_ENABLED requires a Stripe secret key.');
  }
  if (raw.PROMOTION_FINGERPRINT_SECRET.length < 32) {
    throw new Error('PROMOTION_FINGERPRINT_SECRET must contain at least 32 characters when promotion card checks are enabled.');
  }
}

export const env = {
  ...raw,
  /**
   * Whether the sale of the hosted mail is open.
   *
   * The value is read at the moment it is asked for, so the operator can
   * close the sale of the mail without waiting for a restart of the API, and
   * the tests can open it for the duration of one run. The value that was
   * parsed when the API started is the fallback for an environment that does
   * not carry the variable at all.
   *
   * Writing to it writes the variable of the environment, so there is one
   * source of truth and not two.
   */
  get MAIL_SALES_ENABLED(): boolean {
    const live = process.env.MAIL_SALES_ENABLED;
    if (live === undefined) return raw.MAIL_SALES_ENABLED;
    return live.trim().toLowerCase() === 'true';
  },
  set MAIL_SALES_ENABLED(value: boolean) {
    process.env.MAIL_SALES_ENABLED = value ? 'true' : 'false';
  },
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
   * Which Stripe the platform talks to: the sandbox of Stripe or the live
   * one. The key of the sandbox starts with "sk_test_" and the key of the
   * live one with "sk_live_", so the mode is read from the key itself and is
   * never guessed.
   */
  stripeMode: raw.STRIPE_SECRET_KEY.startsWith('sk_live_')
    ? 'live'
    : raw.STRIPE_SECRET_KEY.startsWith('sk_test_')
      ? 'sandbox'
      : 'none',
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
  /**
   * The journal of the alarms of the platform.
   *
   * It lives next to the other state of the operations when the operator did
   * not write a path of its own.
   */
  opsAlertLog: raw.OPS_ALERT_LOG.trim() || `${raw.OPS_STATUS_DIR}/ops-alerts.ndjson`,
  /**
   * The directory of the state of the operations.
   */
  opsStatusDir: raw.OPS_STATUS_DIR,
} as const;

export type Env = typeof env;

/**
 * Whether the sale of the hosted mail is open.
 *
 * The switch is read at the moment of the check, so the operator can close
 * the sale of the mail without waiting for a restart of the API, and the
 * tests can open it for the duration of one run.
 */
export function mailSalesEnabled(): boolean {
  return env.MAIL_SALES_ENABLED;
}
