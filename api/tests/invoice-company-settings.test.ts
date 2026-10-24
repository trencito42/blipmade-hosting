import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * The environment is read when the module is loaded, so the values the
 * modules need are set before anything is imported.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://blipmade:blipmade@127.0.0.1:5432/blipmade_test';
process.env.SESSION_SECRET ??= 'invoice-company-settings-test-session-secret';

const { prisma } = await import('../src/db.js');
const {
  COMPANY_SETTING_KEYS,
  companyDetails,
  createLocalRenewal,
  parseTaxRate,
  taxOf,
} = await import('../src/services/billing.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

/**
 * The company and the tax of an invoice.
 *
 * The invoice of a platform has to name the company that sells the service
 * and the tax that is due. The platform never invents any of it: the values
 * come from the settings of the operator, and they are empty until the
 * operator writes them.
 */

/** Writes the settings of the operator, the way the admin area does. */
async function writeCompanySettings(values: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}

/** A service with a subscription of 149 a month. */
async function seedSubscription() {
  const { userId, client } = await registerAndLogin(await getApp(), `invoice-${Date.now()}@example.com`);
  const product = await prisma.product.create({
    data: {
      slug: `invoice-product-${Date.now()}`,
      name: 'Service',
      category: 'WEB_CMS',
      description: 'A service.',
      icon: 'globe',
      deployable: true,
      eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });
  const instance = await prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      name: 'service',
      status: 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
    },
  });
  const subscription = await prisma.subscription.create({
    data: {
      userId,
      instanceId: instance.id,
      status: 'ACTIVE',
      amount: 149,
      currency: 'EUR',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    },
  });
  return { userId, client, subscription };
}

describe('the company and the tax of an invoice', () => {
  beforeAll(async () => {
    await getApp();
  });

  afterAll(async () => {
    await closeApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('has no company of its own', async () => {
    const company = await companyDetails();

    // Nothing is invented: every value is empty until the operator writes it.
    expect(company.name).toBe('');
    expect(company.registration).toBe('');
    expect(company.taxId).toBe('');
    expect(company.address).toBe('');
    expect(company.supportEmail).toBe('');
    expect(company.taxRate).toBeNull();
    expect(company.taxApplies).toBe(false);
    // And the reason of the missing tax is said out loud.
    expect(company.taxNote).toMatch(/tax identifier/i);
  });

  it('reads the values that the operator wrote', async () => {
    await writeCompanySettings({
      [COMPANY_SETTING_KEYS.name]: 'The Operator Ltd',
      [COMPANY_SETTING_KEYS.registration]: 'HR-12345',
      [COMPANY_SETTING_KEYS.taxId]: 'RO123456',
      [COMPANY_SETTING_KEYS.taxRate]: '21',
      [COMPANY_SETTING_KEYS.address]: '1 Example Street, Example City',
      [COMPANY_SETTING_KEYS.supportEmail]: 'help@example.test',
    });

    const company = await companyDetails();

    expect(company.name).toBe('The Operator Ltd');
    expect(company.registration).toBe('HR-12345');
    expect(company.taxId).toBe('RO123456');
    expect(company.taxRate).toBe(21);
    expect(company.address).toBe('1 Example Street, Example City');
    expect(company.supportEmail).toBe('help@example.test');
    expect(company.taxApplies).toBe(true);
    expect(company.taxNote).toBeNull();
  });

  it('adds the tax of the operator to the invoice that the platform writes', async () => {
    const { subscription } = await seedSubscription();
    await writeCompanySettings({
      [COMPANY_SETTING_KEYS.name]: 'The Operator Ltd',
      [COMPANY_SETTING_KEYS.taxId]: 'RO123456',
      [COMPANY_SETTING_KEYS.taxRate]: '21',
    });

    const renewal = await createLocalRenewal(subscription.id);

    const invoice = await prisma.invoice.findUnique({ where: { id: renewal.invoiceId } });
    expect(invoice?.amount).toBeGreaterThan(0);
    // The tax is the rate of the operator on the amount of the invoice.
    expect(invoice?.tax).toBe(Math.round((invoice!.amount * 21) / 100));
    expect(invoice?.total).toBe(invoice!.amount + invoice!.tax);
  });

  it('adds no tax when there is no tax identifier, and says why', async () => {
    const { subscription } = await seedSubscription();
    await writeCompanySettings({
      [COMPANY_SETTING_KEYS.name]: 'The Operator Ltd',
      [COMPANY_SETTING_KEYS.taxRate]: '21',
    });

    const renewal = await createLocalRenewal(subscription.id);

    const invoice = await prisma.invoice.findUnique({ where: { id: renewal.invoiceId } });
    // A tax without a tax identifier is a tax nobody can be charged against.
    expect(invoice?.tax).toBe(0);
    expect(invoice?.total).toBe(invoice?.amount);
    const company = await companyDetails();
    expect(company.taxApplies).toBe(false);
    expect(company.taxNote).toMatch(/tax identifier/i);
  });

  it('reads a rate that is not a number as no rate at all', () => {
    expect(parseTaxRate('')).toBeNull();
    expect(parseTaxRate('many')).toBeNull();
    expect(parseTaxRate('-5')).toBeNull();
    expect(parseTaxRate('0')).toBe(0);
    expect(parseTaxRate('21')).toBe(21);
    expect(parseTaxRate('19.25')).toBe(19.25);
  });

  it('rounds the tax of an amount', () => {
    expect(taxOf(149, 21)).toBe(31);
    expect(taxOf(100, 0)).toBe(0);
    expect(taxOf(0, 21)).toBe(0);
  });

  it('shows the company in the invoice data that the API returns', async () => {
    const { client, subscription } = await seedSubscription();
    await writeCompanySettings({
      [COMPANY_SETTING_KEYS.name]: 'The Operator Ltd',
      [COMPANY_SETTING_KEYS.registration]: 'HR-12345',
      [COMPANY_SETTING_KEYS.taxId]: 'RO123456',
      [COMPANY_SETTING_KEYS.taxRate]: '21',
      [COMPANY_SETTING_KEYS.address]: '1 Example Street, Example City',
      [COMPANY_SETTING_KEYS.supportEmail]: 'help@example.test',
    });
    await createLocalRenewal(subscription.id);

    const response = await client.request('GET', '/api/billing/invoices');

    expect(response.status).toBe(200);
    expect(response.body.company).toEqual({
      name: 'The Operator Ltd',
      registration: 'HR-12345',
      taxId: 'RO123456',
      taxRate: 21,
      address: '1 Example Street, Example City',
      supportEmail: 'help@example.test',
      taxApplies: true,
      taxNote: null,
    });
    expect(response.body.invoices).toHaveLength(1);
    const amount = response.body.invoices[0].amount;
    expect(response.body.invoices[0].tax).toBe(Math.round((amount * 21) / 100));
    expect(response.body.invoices[0].total).toBe(amount + response.body.invoices[0].tax);
  });

  it('shows empty company details while the operator has written nothing', async () => {
    const { client } = await seedSubscription();

    const response = await client.request('GET', '/api/billing/invoices');

    expect(response.status).toBe(200);
    expect(response.body.company.name).toBe('');
    expect(response.body.company.registration).toBe('');
    expect(response.body.company.taxId).toBe('');
    expect(response.body.company.address).toBe('');
    expect(response.body.company.supportEmail).toBe('');
    expect(response.body.company.taxRate).toBeNull();
    expect(response.body.company.taxApplies).toBe(false);
  });
});
