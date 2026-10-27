import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * The passwords the platform makes for an instance.
 *
 * Some eggs ask for a password in their own variables, and the panel refuses
 * a server whose environment does not carry it. The default of the egg is the
 * same for every customer, so it cannot be used: two customers would hold the
 * same password, and everybody who knows it could reach the service of
 * everybody else.
 *
 * The platform therefore makes one value per instance, writes it in the
 * environment of the container and keeps it on the instance, encrypted. The
 * owner of the instance reads it in the console of the service.
 */

const { prisma } = await import('../src/db.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');
const {
  generateSecret,
  generateVariables,
  openVariables,
  parseGeneratedVariableSpecs,
  sealVariables,
} = await import('../src/services/instance-credentials.js');

/** A product that needs a password of its own. */
async function makeProduct(options: { slug: string; variables: unknown }): Promise<string> {
  const product = await prisma.product.create({
    data: {
      slug: options.slug,
      name: 'Test product',
      category: 'DATABASES',
      description: 'A product used only by the tests.',
      icon: 'db',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      deployable: true,
      eggId: 1,
      generatedVariables: options.variables as never,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });
  return product.id;
}

async function makeInstance(ownerId: string, productId: string, variables: string | null) {
  return prisma.instance.create({
    data: {
      userId: ownerId,
      productId,
      name: 'Test instance',
      status: 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
      pterodactylServerId: 100,
      pterodactylUuid: 'server-uuid',
      generatedVariables: variables,
    },
  });
}

beforeAll(async () => {
  await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('the variables a product declares', () => {
  it('is read as it is written', () => {
    const specs = parseGeneratedVariableSpecs({ PGPASSWORD: { length: 20, label: 'Password' } });
    expect(specs.PGPASSWORD?.length).toBe(20);
    expect(specs.PGPASSWORD?.label).toBe('Password');
  });

  it('is ignored when it is not a declaration', () => {
    // A product written by an older version of the platform carries nothing.
    expect(parseGeneratedVariableSpecs(null)).toEqual({});
    expect(parseGeneratedVariableSpecs('PGPASSWORD')).toEqual({});
    expect(parseGeneratedVariableSpecs(['PGPASSWORD'])).toEqual({});
    expect(parseGeneratedVariableSpecs({ 'not a variable': { length: 20 } })).toEqual({});
  });

  it('keeps the length inside the limit of the egg', () => {
    // The eggs of the platform accept at most 32 characters, and a password
    // that is shorter than 12 is no password.
    expect(parseGeneratedVariableSpecs({ PASSWORD: { length: 500 } }).PASSWORD?.length).toBe(32);
    expect(parseGeneratedVariableSpecs({ PASSWORD: { length: 2 } }).PASSWORD?.length).toBe(12);
    expect(parseGeneratedVariableSpecs({ PASSWORD: {} }).PASSWORD?.length).toBe(20);
  });
});

describe('the password that is made', () => {
  it('is not the same from one to the other', () => {
    const first = generateSecret(20);
    const second = generateSecret(20);
    expect(first).toHaveLength(20);
    expect(first).not.toBe(second);
  });

  it('holds one value for every declared variable', () => {
    const values = generateVariables({ PGPASSWORD: { length: 20 }, PASSWORD: { length: 24 } });
    expect(Object.keys(values).sort()).toEqual(['PASSWORD', 'PGPASSWORD']);
    expect(values.PGPASSWORD).toHaveLength(20);
    expect(values.PASSWORD).toHaveLength(24);
  });

  it('is kept encrypted and read back', () => {
    const values = { PGPASSWORD: 'abc123' };
    const sealed = sealVariables(values);
    expect(sealed).not.toContain('abc123');
    expect(openVariables(sealed)).toEqual(values);
  });

  it('is reported as unreadable when the secret was rotated', () => {
    // The value was written with another secret, so it cannot be read any
    // more. The console says so instead of showing an empty password.
    expect(openVariables('v1.bm90ZQ.bm90ZQ.bm90ZQ')).toBeNull();
    expect(openVariables(null)).toBeNull();
  });
});

describe('the credentials of an instance', () => {
  it('are read by the owner of the instance', async () => {
    const app = await getApp();
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const productId = await makeProduct({
      slug: 'product-with-password',
      variables: { PGPASSWORD: { length: 20, label: 'Password of the database superuser' } },
    });
    const instance = await makeInstance(userId, productId, sealVariables({ PGPASSWORD: 'made-for-this-one' }));

    const response = await client.request('GET', `/api/instances/${instance.id}/credentials`);
    expect(response.status).toBe(200);
    const body = response.body as { credentials: { name: string; label: string; value: string }[] };
    expect(body.credentials).toHaveLength(1);
    expect(body.credentials[0]?.name).toBe('PGPASSWORD');
    expect(body.credentials[0]?.label).toBe('Password of the database superuser');
    expect(body.credentials[0]?.value).toBe('made-for-this-one');
  });

  it('are not read by another customer', async () => {
    const app = await getApp();
    const { client: owner, userId } = await registerAndLogin(app, 'owner@example.com');
    const { client: other } = await registerAndLogin(app, 'other@example.com');
    const productId = await makeProduct({
      slug: 'product-of-another-customer',
      variables: { PGPASSWORD: { length: 20 } },
    });
    const instance = await makeInstance(userId, productId, sealVariables({ PGPASSWORD: 'made-for-this-one' }));

    const response = await other.request('GET', `/api/instances/${instance.id}/credentials`);
    // The answer is the one of an instance that does not exist, so an
    // identifier cannot be probed.
    expect(response.status).toBe(404);
    expect(owner).toBeTruthy();
  });

  it('are empty for a service that needs no password', async () => {
    const app = await getApp();
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const productId = await makeProduct({ slug: 'product-without-password', variables: null });
    const instance = await makeInstance(userId, productId, null);

    const response = await client.request('GET', `/api/instances/${instance.id}/credentials`);
    expect(response.status).toBe(200);
    const body = response.body as { credentials: unknown[] };
    expect(body.credentials).toEqual([]);
  });

  it('are read when they were written with the secret of this deployment', async () => {
    const app = await getApp();
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const productId = await makeProduct({
      slug: 'product-with-a-written-secret',
      variables: { PGPASSWORD: { length: 20 } },
    });
    const instance = await makeInstance(userId, productId, sealVariables({ PGPASSWORD: 'abc' }));

    const response = await client.request('GET', `/api/instances/${instance.id}/credentials`);
    expect(response.status).toBe(200);
    const body = response.body as { credentials: { name: string; value: string | null }[] };
    expect(body.credentials[0]?.name).toBe('PGPASSWORD');
    expect(body.credentials[0]?.value).toBe('abc');
  });

  it('say that a value cannot be read any more when the secret was rotated', async () => {
    const app = await getApp();
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const productId = await makeProduct({
      slug: 'product-with-a-rotated-secret',
      variables: { PGPASSWORD: { length: 20 } },
    });
    // The value was written with another secret, so it cannot be read. The
    // console says so instead of showing an empty password.
    const instance = await makeInstance(userId, productId, 'v1.bm90ZQ.bm90ZQ.bm90ZQ');

    const response = await client.request('GET', `/api/instances/${instance.id}/credentials`);
    expect(response.status).toBe(200);
    const body = response.body as { credentials: { name: string; value: string | null }[] };
    expect(body.credentials[0]?.name).toBe('PGPASSWORD');
    expect(body.credentials[0]?.value).toBeNull();
  });
});
