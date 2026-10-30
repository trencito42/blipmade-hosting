import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/lib/password.js';
import { assertSeedTargetIsSafe } from '../src/lib/seed-guard.js';
import { seedMailPlanDrafts } from '../src/lib/mail-plan-drafts.js';
import { importCatalogue, parseManifest } from '../src/lib/catalogue-import.js';

const prisma = new PrismaClient();

/**
 * Seeds the catalog and, when ADMIN_EMAIL and ADMIN_PASSWORD are present in the
 * environment, the first administrator. Everything is idempotent, so the seed
 * can be run on every deploy.
 *
 * The catalog is made of two parts: the five products that were on the
 * platform before the eggs of the catalogue arrived, written here by hand, and
 * the products of the manifest of the eggs, written out of the manifest. The
 * manifest is the truth of the catalogue, so the seed and the importer of the
 * catalogue write the same products.
 */

interface SeedProduct {
  slug: string;
  name: string;
  category: 'WEB_CMS' | 'DEVELOPER_TOOLS' | 'MONITORING' | 'AUTOMATION' | 'BOTS' | 'DATABASES' | 'GAMES';
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
  /** The name of the egg of the panel the product runs on. */
  eggName: string | null;
  dockerImage: string | null;
  /** The command the container runs. Overrides the egg default when set. */
  startupCommand: string | null;
  /** Environment variables passed to the container. */
  startup: Record<string, string>;
  /** The variables the platform makes for every instance of the product. */
  generatedVariables: Record<string, { length: number; label: string }> | null;
  deployable: boolean;
  sortOrder: number;
}

/**
 * The only mapping that has been verified end to end on the live panel is
 * egg 15 ("node.js generic", nest 5) with the image
 * ghcr.io/ptero-eggs/yolks:nodejs_25. A Node.js container was smoke tested
 * on it and answered HTTP 200 on 10.77.0.11:30000.
 *
 * The three official eggs of Pterodactyl — Code-Server, Uptime Kuma and
 * Postgres 16 — are named here, because they are imported into the panel by
 * name and the number of an egg belongs to the panel. They stay
 * `deployable: false` until a server of each of them was really built and
 * answered on the node, because a product that is opened for ordering before
 * it was proved fails in front of a paying customer.
 *
 * WordPress stays closed as well: the node.js egg is not WordPress, so a
 * WordPress product that runs on it would give the customer something else
 * than what he paid for.
 */
const VERIFIED_EGG_ID = 15;
const VERIFIED_IMAGE = 'ghcr.io/ptero-eggs/yolks:nodejs_25';

const PRODUCTS: SeedProduct[] = [
  {
    slug: 'wordpress',
    name: 'WordPress',
    category: 'WEB_CMS',
    description:
      'The most widely used publishing platform, for sites, blogs and shops.',
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
    eggName: null,
    dockerImage: null,
    startupCommand: null,
    startup: {},
    generatedVariables: null,
    deployable: false,
    sortOrder: 10,
  },
  {
    slug: 'code-server',
    name: 'Code Server',
    category: 'DEVELOPER_TOOLS',
    description:
      'Visual Studio Code in your browser, running on the resources you choose.',
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
    eggName: 'Code-Server',
    dockerImage: 'ghcr.io/ptero-eggs/yolks:nodejs_18',
    startupCommand: null,
    startup: {},
    // The password of the editor is made for every instance, so two
    // customers never hold the same one.
    generatedVariables: { PASSWORD: { length: 24, label: 'Password of the editor' } },
    deployable: false,
    sortOrder: 20,
  },
  {
    slug: 'discord-bot',
    name: 'Discord Bot',
    category: 'BOTS',
    description:
      'Run a Node.js Discord bot around the clock, without keeping a computer on.',
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
    eggName: 'node.js generic',
    dockerImage: VERIFIED_IMAGE,
    // The generic Node.js egg starts the container with `npm run start`, and
    // MAIN_FILE tells it which file that script runs.
    startupCommand: 'npm run start',
    startup: { MAIN_FILE: 'index.js' },
    generatedVariables: null,
    deployable: true,
    sortOrder: 30,
  },
  {
    slug: 'uptime-kuma',
    name: 'Uptime Kuma',
    category: 'MONITORING',
    description:
      'Monitor websites and services, with status pages you can share.',
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
    eggName: 'Uptime Kuma',
    dockerImage: 'ghcr.io/ptero-eggs/apps:uptimekuma',
    startupCommand: null,
    startup: {},
    generatedVariables: null,
    deployable: false,
    sortOrder: 40,
  },
  {
    slug: 'postgresql',
    name: 'PostgreSQL',
    category: 'DATABASES',
    description:
      'A PostgreSQL database for your applications, with its own connection details and password.',
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
    eggName: 'Postgres 16',
    dockerImage: 'ghcr.io/ptero-eggs/yolks:postgres_16',
    startupCommand: null,
    startup: {},
    // The password of the superuser is made for every instance, so two
    // customers never hold the same one.
    generatedVariables: { PGPASSWORD: { length: 20, label: 'Password of the database superuser' } },
    deployable: false,
    sortOrder: 50,
  },
];

async function main(): Promise<void> {
  // The guard runs before the first write. The seed rebuilds the catalog of
  // the platform, and the live database holds the customers: running the
  // seed against it is how the platform lost its data on 2026-10-26.
  assertSeedTargetIsSafe();

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
        eggName: product.eggName,
        dockerImage: product.dockerImage,
        startup: product.startup,
        startupCommand: product.startupCommand,
        generatedVariables: product.generatedVariables as never,
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
        eggName: product.eggName,
        dockerImage: product.dockerImage,
        startup: product.startup,
        startupCommand: product.startupCommand,
        generatedVariables: product.generatedVariables as never,
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

  // The products of the eggs: the games, the applications and the runtimes.
  // The manifest is the truth of the catalogue, and it is the same file the
  // importer of the catalogue writes into the live database.
  const manifestPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'pterodactyl-eggs',
    'manifest.json',
  );
  const catalogue = parseManifest(readFileSync(manifestPath, 'utf8'));
  const report = await importCatalogue(prisma, catalogue, {
    rates: { ramPerGb: 200, cpuPerUnit: 75, diskPerGb: 5 },
  });
  console.info(
    `Seeded the catalogue of the eggs: ${report.created.length} products written, ${report.updated.length} brought back to the manifest.`,
  );

  const mailPlans = await seedMailPlanDrafts(prisma);
  console.info(
    `Wrote ${mailPlans.written} draft plans of hosted mail and kept ${mailPlans.kept} that were already there.`,
  );

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