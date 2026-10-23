/**
 * Creates (or refreshes) the two accounts that the browser checks sign in
 * with: one customer and one staff member.
 *
 * The password is never stored in the repository. It is read from
 * BM_PASSWORD, or generated here and printed once, so the operator can use it
 * for the browser run and then forget it.
 *
 * Usage (inside the api container, where DATABASE_URL is valid):
 *   BM_PASSWORD='...' node scripts/ops/seed-browser-account.mjs
 *
 * Environment:
 *   BM_PASSWORD   the password of both accounts (optional, generated if unset)
 *   BM_CLEANUP    when '1', the accounts are deleted instead of created
 */
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

const CUSTOMER_EMAIL = 'browser-customer@blipmade.test';
const ADMIN_EMAIL = 'browser-admin@blipmade.test';

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

/** The same encoding the API uses, so the login endpoint accepts it. */
async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

function strongPassword() {
  // The API asks for a lowercase letter, an uppercase letter, a number and at
  // least ten characters.
  return `Bm${randomBytes(9).toString('base64url')}7Aa`;
}

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const password = process.env.BM_PASSWORD || strongPassword();
const generated = !process.env.BM_PASSWORD;

try {
  if (process.env.BM_CLEANUP === '1') {
    for (const email of [CUSTOMER_EMAIL, ADMIN_EMAIL]) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        await prisma.staffMember.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
        console.log(`removed ${email}`);
      }
    }
  } else {
    const passwordHash = await hashPassword(password);

    const customer = await prisma.user.upsert({
      where: { email: CUSTOMER_EMAIL },
      update: { passwordHash, emailVerifiedAt: new Date(), suspendedAt: null, firstName: 'Browser', lastName: 'Customer' },
      create: {
        email: CUSTOMER_EMAIL,
        passwordHash,
        emailVerifiedAt: new Date(),
        firstName: 'Browser',
        lastName: 'Customer',
        role: 'CUSTOMER',
      },
    });

    const admin = await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: { passwordHash, emailVerifiedAt: new Date(), suspendedAt: null, firstName: 'Browser', lastName: 'Admin', role: 'ADMIN' },
      create: {
        email: ADMIN_EMAIL,
        passwordHash,
        emailVerifiedAt: new Date(),
        firstName: 'Browser',
        lastName: 'Admin',
        role: 'ADMIN',
      },
    });

    // An instance without a server on the panel. The detail page has to render
    // it with honest states, not with a broken screen.
    const product = await prisma.product.findFirst({ where: { slug: 'discord-bot' } });
    if (product) {
      const existing = await prisma.instance.findFirst({ where: { userId: customer.id } });
      if (!existing) {
        await prisma.instance.create({
          data: {
            userId: customer.id,
            productId: product.id,
            name: 'Browser instance',
            status: 'PENDING',
            ram: 512,
            cpu: 1,
            disk: 5,
            price: 149,
            currency: 'EUR',
          },
        });
      }
    }

    await prisma.staffMember.upsert({
      where: { userId: admin.id },
      update: { permissions: [] },
      create: { userId: admin.id, permissions: [], title: 'Browser check' },
    });

    console.log(`customer ${CUSTOMER_EMAIL} id=${customer.id}`);
    console.log(`admin    ${ADMIN_EMAIL} id=${admin.id}`);
    if (generated) console.log(`password ${password}`);
  }
} finally {
  await prisma.$disconnect();
}
