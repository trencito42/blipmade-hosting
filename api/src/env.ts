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

  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_PUBLISHABLE_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),

  SMTP_URL: z.string().default(''),
  MAIL_FROM: z.string().default('Blipmade <no-reply@blipmade.com>'),

  INTERNAL_API_TOKEN: z.string().default(''),
  BLIPMADE_INTERNAL_API_TOKEN: z.string().default(''),
  ADMIN_ENROLLMENT_KEY: z.string().default(''),

  BACKUP_DIR: z.string().default('/var/backups/blipmade'),
  /** Where the files attached to support tickets are stored. */
  ATTACHMENT_DIR: z.string().default('/data/uploads'),
  DOMAIN_BASE: z.string().default(''),
  CADDY_ADMIN_URL: z.string().default(''),
  CADDY_ADMIN_TOKEN: z.string().default(''),
  METRICS_ENABLED: bool(true),
  LOG_LEVEL: z.string().default('info'),

  /**
   * The addresses that are allowed to set the forwarding headers. Only these
   * are trusted, so a client cannot forge its own address and slip past the
   * rate limit.
   */
  TRUSTED_PROXIES: z.string().default('127.0.0.1,::1,172.16.0.0/12'),

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
  stripeEnabled: raw.STRIPE_SECRET_KEY.startsWith('sk_'),
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
