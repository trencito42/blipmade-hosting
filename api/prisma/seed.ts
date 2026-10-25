import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const prisma = new PrismaClient();

/**
 * Seeds the catalog and, when ADMIN_EMAIL and ADMIN_PASSWORD are present in the
 * environment, the first administrator. Everything is idempotent, so the seed
 * can be run on every deploy.
 */

interface SeedProduct {
  slug: string;
  name: string;
  category: 'WEB_CMS' | 'DEVELOPER_TOOLS' | 'MONITORING' | 'AUTOMATION' | 'BOTS' | 'DATABASES';
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
  baseAmount: number;
  eggId: number | null;
  dockerImage: string | null;
  /** The command the container runs. Overrides the egg default when set. */
  startupCommand: string | null;
  /** Environment variables passed to the container. */
  startup: Record<string, string>;
  deployable: boolean;
  sortOrder: number;
}

/**
 * The only mapping that has been verified end to end on the live panel is
 * egg 15 ("node.js generic", nest 5) with the image
 * ghcr.io/ptero-eggs/yolks:nodejs_25. A Node.js container was smoke tested
 * on it and answered HTTP 200 on 10.77.0.11:30000.
 *
 * So only the product that runs on that egg is deployable. Every other
 * product stays unavailable until its own image is installed on the panel and
 * smoke tested, which means it must not advertise an egg, an image or a
 * startup command that does not exist there. An invented mapping would fail
 * at provisioning time, in front of a paying customer.
 */
const VERIFIED_EGG_ID = 15;
const VERIFIED_IMAGE = 'ghcr.io/ptero-eggs/yolks:nodejs_25';

const PRODUCTS: SeedProduct[] = [
  {
    slug: 'wordpress',
    name: 'WordPress',
    category: 'WEB_CMS',
    description:
      'The most widely used CMS. Its image is not installed on the platform yet, so it is listed but cannot be deployed.',
    icon: 'globe',
    minRam: 512,
    minCpu: 1,
    minDisk: 5,
    defaultRam: 1024,
    defaultCpu: 1,
    defaultDisk: 10,
    maxRam: 8192,
    maxCpu: 4,
    maxDisk: 100,
    baseAmount: 149,
    eggId: null,
    dockerImage: null,
    startupCommand: null,
    startup: {},
    deployable: false,
    sortOrder: 10,
  },
  {
    slug: 'code-server',
    name: 'Code Server',
    category: 'DEVELOPER_TOOLS',
    description:
      'Visual Studio Code in the browser, running on your own resources. Its image is not installed on the platform yet, so it cannot be deployed.',
    icon: 'term',
    minRam: 1024,
    minCpu: 1,
    minDisk: 5,
    defaultRam: 2048,
    defaultCpu: 1,
    defaultDisk: 10,
    maxRam: 16384,
    maxCpu: 4,
    maxDisk: 100,
    baseAmount: 299,
    eggId: null,
    dockerImage: null,
    startupCommand: null,
    startup: {},
    deployable: false,
    sortOrder: 20,
  },
  {
    slug: 'discord-bot',
    name: 'Discord Bot',
    category: 'BOTS',
    description:
      'Run a Node.js bot around the clock without a home server. Runs on the verified Node.js image.',
    icon: 'bot',
    minRam: 256,
    minCpu: 1,
    minDisk: 1,
    defaultRam: 512,
    defaultCpu: 1,
    defaultDisk: 5,
    maxRam: 4096,
    maxCpu: 4,
    maxDisk: 50,
    baseAmount: 149,
    eggId: VERIFIED_EGG_ID,
    dockerImage: VERIFIED_IMAGE,
    // The generic Node.js egg starts the container with `npm run start`, and
    // MAIN_FILE tells it which file that script runs.
    startupCommand: 'npm run start',
    startup: { MAIN_FILE: 'index.js' },
    deployable: true,
    sortOrder: 30,
  },
  {
    slug: 'uptime-kuma',
    name: 'Uptime Kuma',
    category: 'MONITORING',
    description:
      'Simple uptime monitoring with public status pages. Its image is not installed on the platform yet, so it cannot be deployed.',
    icon: 'mon',
    minRam: 256,
    minCpu: 1,
    minDisk: 5,
    defaultRam: 512,
    defaultCpu: 1,
    defaultDisk: 10,
    maxRam: 4096,
    maxCpu: 2,
    maxDisk: 50,
    baseAmount: 149,
    eggId: null,
    dockerImage: null,
    startupCommand: null,
    startup: {},
    deployable: false,
    sortOrder: 40,
  },
  {
    slug: 'postgresql',
    name: 'PostgreSQL',
    category: 'DATABASES',
    description:
      'Relational database with a connection string for your applications. Its image is not installed on the platform yet, so it cannot be deployed.',
    icon: 'db',
    minRam: 1024,
    minCpu: 1,
    minDisk: 5,
    defaultRam: 1024,
    defaultCpu: 1,
    defaultDisk: 10,
    maxRam: 16384,
    maxCpu: 4,
    maxDisk: 200,
    baseAmount: 449,
    eggId: null,
    dockerImage: null,
    startupCommand: null,
    startup: {},
    deployable: false,
    sortOrder: 50,
  },
];

/**
 * The plans of hosted mail.
 *
 * The plans are DRAFTS. They carry the limits that were proposed and no
 * price at all: the price of the mail is a commercial decision of the
 * operator, and the sale of the mail stays closed until the payment, the
 * mail system, the DNS, the backup and the delivery have been proved from
 * end to end.
 *
 * The limits that are written here are the limits that were PROPOSED. The
 * limits that are really applied are the smaller of them and the ceiling of
 * the platform (the MAIL_MAX_* values of the environment), so a plan can
 * never promise more than the platform can hold.
 */
interface SeedMailPlan {
  slug: string;
  name: string;
  description: string;
  icon: string;
  maxDomains: number;
  maxMailboxes: number;
  maxAliases: number;
  maxForwarding: number;
  totalStorageMb: number;
  mailboxQuotaMb: number;
  sendLimit: number;
  sendInterval: 'MINUTELY' | 'HOURLY' | 'DAILY';
  sortOrder: number;
}

const MAIL_PLANS: SeedMailPlan[] = [
  {
    slug: 'email-starter',
    name: 'Email Starter',
    description:
      'Hosted mail for one domain, with the mailboxes and the aliases a small team needs. The price is not set yet.',
    icon: 'mail',
    maxDomains: 1,
    maxMailboxes: 5,
    maxAliases: 25,
    maxForwarding: 5,
    totalStorageMb: 5120,
    mailboxQuotaMb: 1024,
    sendLimit: 200,
    sendInterval: 'HOURLY',
    sortOrder: 100,
  },
  {
    slug: 'email-plus',
    name: 'Email Plus',
    description:
      'Hosted mail for a few domains, with more space and a larger sending limit. The price is not set yet.',
    icon: 'mail',
    maxDomains: 3,
    maxMailboxes: 10,
    maxAliases: 100,
    maxForwarding: 10,
    totalStorageMb: 10240,
    mailboxQuotaMb: 1024,
    sendLimit: 500,
    sendInterval: 'HOURLY',
    sortOrder: 101,
  },
  {
    slug: 'email-business',
    name: 'Email Business',
    description:
      'Hosted mail for a company: more domains, more space and a sending limit that follows the business. The price is not set yet.',
    icon: 'mail',
    maxDomains: 10,
    maxMailboxes: 25,
    maxAliases: 250,
    maxForwarding: 25,
    totalStorageMb: 102400,
    mailboxQuotaMb: 4096,
    sendLimit: 2000,
    sendInterval: 'HOURLY',
    sortOrder: 102,
  },
];

/**
 * Writes the plans of hosted mail.
 *
 * Everything is idempotent: the seed can be run on every deploy. A plan that
 * the operator has already put on sale keeps its price and its state, because
 * the seed never touches the commercial decisions of the operator.
 */
async function seedMailPlans(): Promise<void> {
  for (const plan of MAIL_PLANS) {
    const existing = await prisma.product.findUnique({ where: { slug: plan.slug } });
    if (existing) {
      // A plan that is already there belongs to the operator: its price, its
      // state and the limits that were tuned in the back office are never
      // written over by a deploy.
      continue;
    }

    await prisma.product.create({
      data: {
        slug: plan.slug,
        name: plan.name,
        category: 'EMAIL_HOSTING',
        fulfilment: 'EMAIL',
        description: plan.description,
        icon: plan.icon,
        eggId: null,
        visible: true,
        // A draft is not on sale: the operator opens it when the price is
        // written and the mail has been proved from end to end.
        deployable: false,
        sortOrder: plan.sortOrder,
        mailMaxDomains: plan.maxDomains,
        mailMaxMailboxes: plan.maxMailboxes,
        mailMaxAliases: plan.maxAliases,
        mailMaxForwarding: plan.maxForwarding,
        mailTotalStorageMb: plan.totalStorageMb,
        mailMailboxQuotaMb: plan.mailboxQuotaMb,
        mailSendLimit: plan.sendLimit,
        mailSendInterval: plan.sendInterval,
      },
    });
  }
  console.info(`Seeded ${MAIL_PLANS.length} draft plans of hosted mail.`);
}

async function main(): Promise<void> {
  console.info('Seeding catalog…');
  for (const product of PRODUCTS) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      create: {
        slug: product.slug,
        name: product.name,
        category: product.category,
        description: product.description,
        icon: product.icon,
        minRam: product.minRam,
        minCpu: product.minCpu,
        minDisk: product.minDisk,
        defaultRam: product.defaultRam,
        defaultCpu: product.defaultCpu,
        defaultDisk: product.defaultDisk,
        maxRam: product.maxRam,
        maxCpu: product.maxCpu,
        maxDisk: product.maxDisk,
        eggId: product.eggId,
        dockerImage: product.dockerImage,
        startup: product.startup,
        startupCommand: product.startupCommand,
        deployable: product.deployable,
        visible: true,
        sortOrder: product.sortOrder,
        prices: { create: { period: 'MONTHLY', baseAmount: product.baseAmount, currency: 'EUR' } },
      },
      update: {
        name: product.name,
        category: product.category,
        description: product.description,
        icon: product.icon,
        minRam: product.minRam,
        minCpu: product.minCpu,
        minDisk: product.minDisk,
        defaultRam: product.defaultRam,
        defaultCpu: product.defaultCpu,
        defaultDisk: product.defaultDisk,
        maxRam: product.maxRam,
        maxCpu: product.maxCpu,
        maxDisk: product.maxDisk,
        // The egg mapping and the deployable flag state what has been
        // verified on the panel, so the seed is authoritative for them. A
        // product that lost its mapping here loses it in the database too.
        eggId: product.eggId,
        dockerImage: product.dockerImage,
        startup: product.startup,
        startupCommand: product.startupCommand,
        deployable: product.deployable,
        sortOrder: product.sortOrder,
      },
    });

    const existing = await prisma.productPrice.findFirst({
      where: { productId: (await prisma.product.findUniqueOrThrow({ where: { slug: product.slug } })).id, period: 'MONTHLY' },
    });
    if (!existing) {
      await prisma.productPrice.create({
        data: {
          productId: (await prisma.product.findUniqueOrThrow({ where: { slug: product.slug } })).id,
          period: 'MONTHLY',
          baseAmount: product.baseAmount,
          currency: 'EUR',
        },
      });
    }
  }
  console.info(`Seeded ${PRODUCTS.length} products.`);
  await seedMailPlans();

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    const existing = await prisma.user.findUnique({ where: { email: adminEmail.toLowerCase() } });
    if (!existing) {
      const passwordHash = await hashPassword(adminPassword);
      const user = await prisma.user.create({
        data: {
          email: adminEmail.toLowerCase(),
          passwordHash,
          role: 'ADMIN',
          firstName: 'Blipmade',
          lastName: 'Administrator',
          emailVerifiedAt: new Date(),
        },
      });
      await prisma.staffMember.create({ data: { userId: user.id, permissions: [], title: 'Administrator' } });
      console.info(`Created administrator ${adminEmail}.`);
    } else {
      console.info(`Administrator ${adminEmail} already exists.`);
    }
  } else {
    console.info('ADMIN_EMAIL and ADMIN_PASSWORD are not set. No administrator was created.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());