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
