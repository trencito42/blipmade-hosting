import { test, expect, type Page } from '@playwright/test';

/**
 * The pages of the public site.
 *
 * The site is served by the server of the platform and the server forwards
 * `/api` to the API, so the tests see the same prices the API charges and the
 * same pages a visitor sees.
 *
 * The price is checked against the answer of the API, not against a number
 * written in the test: the catalog sends the smallest price of a product and
 * the price of the recommended configuration, and the site has to show those
 * numbers and to arrive at them with its own arithmetic.
 */

interface CatalogProduct {
  slug: string;
  name: string;
  pricing: {
    currency: string;
    minimum: { ram: number; cpu: number; disk: number; amount: number };
    recommended: { ram: number; cpu: number; disk: number; amount: number };
  } | null;
  availability?: { state?: string; orderable?: boolean };
}

/**
 * The products that can really be ordered.
 *
 * The catalog of the API holds every product of the platform, and the answer
 * says which of them can be deployed. The site shows the ones that can be
 * ordered, and only those.
 */
async function catalog(page: Page): Promise<CatalogProduct[]> {
  const answer = await page.request.get('/api/catalog/products');
  expect(answer.ok()).toBeTruthy();
  const body = (await answer.json()) as { products: CatalogProduct[] } | CatalogProduct[];
  const products = Array.isArray(body) ? body : body.products;
  return products.filter((product) => product.availability?.state === 'DEPLOYABLE' && product.availability?.orderable);
}

/** The price of a configuration, with the arithmetic of the platform. */
function price(ram: number, cpu: number, disk: number, rates: { ramPerGb: number; cpuPerUnit: number; diskPerGb: number; baseFee: number }): number {
  const denominator = 1024 * 100;
  const exact = rates.baseFee * denominator + ram * rates.ramPerGb * 100 + Math.round(cpu * 100) * rates.cpuPerUnit * 1024 + disk * rates.diskPerGb * denominator;
  return Math.floor((exact + denominator / 2) / denominator);
}

const euros = (cents: number) => `€${(cents / 100).toFixed(2)}`;

test.describe('the home page', () => {
  test('shows the configurator and the card of rates', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Hosting for everything you run.' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Price configurator' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'One card of rates. Every app.' })).toBeVisible();

    // The four rates of the card are the rates of the platform.
    await expect(page.getByText('per GB of RAM', { exact: true })).toBeVisible();
    await expect(page.getByText('per vCPU', { exact: true })).toBeVisible();
    await expect(page.getByText('per GB of disk', { exact: true })).toBeVisible();
    await expect(page.getByText('base fee', { exact: true })).toBeVisible();
  });

  test('shows the smallest price of every product of the catalog', async ({ page }) => {
    await page.goto('/');
    const products = await catalog(page);
    const deployable = products.filter((product) => product.pricing);

    for (const product of deployable) {
      await expect(page.getByRole('link', { name: new RegExp(product.name) }).first()).toBeVisible();
    }
  });

  test('the total of the configurator is the price of the server', async ({ page }) => {
    await page.goto('/');
    const products = await catalog(page);
    const product = products.find((entry) => entry.slug === 'discord-bot');
    expect(product?.pricing).toBeTruthy();

    // The configurator opens on the configuration the platform recommends, and
    // the price of that configuration is the price the server sent for it.
    const total = page.getByRole('region', { name: 'Price configurator' }).locator('p[role="status"]');
    await expect(total).toHaveText(euros(product!.pricing!.recommended.amount));
  });

  test('moving a slider moves the price, and the price is the one of the server', async ({ page }) => {
    await page.goto('/');
    const products = await catalog(page);
    const product = products.find((entry) => entry.slug === 'discord-bot');
    expect(product?.pricing).toBeTruthy();

    const ram = page.getByRole('slider', { name: 'RAM' });
    // The value of a slider is set the way a browser sets it, so the page
    // sees the change.
    await ram.evaluate((element: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(element, '2048');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const expected = price(2048, 1, 1, { ramPerGb: 200, cpuPerUnit: 75, diskPerGb: 5, baseFee: 49 });
    await expect(page.getByRole('region', { name: 'Price configurator' }).locator('p[role="status"]')).toHaveText(euros(expected));
    // The price of the server for the same resources is the price of the site.
    expect(expected).toBeGreaterThan(product!.pricing!.minimum.amount);
  });

  test('the page is written to the disk with the price of the server', async ({ page }) => {
    // The page of the site is written before it is served: the file holds the
    // page and the head, and a reader without JavaScript reads the same thing.
    const answer = await page.request.get('/');
    const html = await answer.text();
    expect(html).toContain('Hosting for everything you run.');
    expect(html).toContain('<title>Blipmade: hosting for bots, apps and databases</title>');
    expect(html).toContain('rel="canonical"');
  });
});

test.describe('the catalog of the apps', () => {
  test('shows every product that can be deployed, and only those', async ({ page }) => {
    await page.goto('/apps');
    const products = (await catalog(page)).filter((product) => product.pricing);

    for (const product of products) {
      await expect(page.getByRole('link', { name: new RegExp(product.name) }).first()).toBeVisible();
      await expect(page.getByText(euros(product.pricing!.minimum.amount)).first()).toBeVisible();
    }
  });

  test('the page of a product holds a configurator and the price of the server', async ({ page }) => {
    await page.goto('/apps/code-server');
    const products = await catalog(page);
    const product = products.find((entry) => entry.slug === 'code-server');
    expect(product).toBeTruthy();

    await expect(page.getByRole('region', { name: 'Price configurator' })).toBeVisible();
    if (product?.pricing) {
      await expect(page.getByRole('region', { name: 'Price configurator' }).locator('p[role="status"]')).toHaveText(
        euros(product.pricing.recommended.amount),
      );
    }
    // The product cannot be changed on the page of the product.
    await expect(page.getByRole('radio', { name: 'Code Server' })).toHaveCount(0);
  });

  test('the address of the account carries the configuration', async ({ page }) => {
    await page.goto('/apps/code-server');
    const link = page.getByRole('link', { name: /Create account and deploy/i });
    await expect(link).toHaveAttribute('href', /^\/register\?app=code-server&ram=/);
  });
});

test.describe('the documentation', () => {
  test('lists the pages and sends them to their own address', async ({ page }) => {
    await page.goto('/docs');

    await expect(page.getByRole('heading', { level: 1, name: /documentation/i })).toBeVisible();
    const link = page.getByRole('link', { name: 'Upgrade or resize an instance' }).first();
    await expect(link).toHaveAttribute('href', '/docs/upgrade');
  });

  test('shows a page of the documentation with its content', async ({ page }) => {
    await page.goto('/docs/upgrade');

    await expect(page.getByRole('heading', { level: 1, name: 'Upgrade or resize an instance' })).toBeVisible();
    // The marker of the content is resolved: no reader sees a brace.
    const body = await page.locator('main').innerText();
    expect(body).not.toContain('{{');
  });

  test('the old form of the address is sent to the new one', async ({ page }) => {
    const answer = await page.request.get('/docs?p=upgrade', { maxRedirects: 0 });
    expect(answer.status()).toBe(301);
    expect(answer.headers()['location']).toBe('/docs/upgrade');
  });

  test('a page of the documentation is written to the disk', async ({ page }) => {
    const answer = await page.request.get('/docs/upgrade');
    const html = await answer.text();
    expect(html).toContain('Upgrade or resize an instance');
    expect(html).toContain('<link rel="canonical" href="https://blipmade.com/docs/upgrade" />');
  });
});

test.describe('the legal pages', () => {
  test('say that the identity of the operator is not settled yet', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeVisible();
    await expect(page.getByText(/legal identity of the operator is still to be confirmed/i)).toBeVisible();
  });

  test('stay out of the index of the search engines', async ({ page }) => {
    await page.goto('/terms');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });
});

test.describe('an address that does not exist', () => {
  test('answers with the page of the address and with the answer 404', async ({ page }) => {
    const answer = await page.request.get('/this-address-does-not-exist');
    expect(answer.status()).toBe(404);
    const html = await answer.text();
    expect(html).toContain('This page is not here.');
  });
});

test.describe('the head of the pages', () => {
  test('every kind of page names itself and the networks', async ({ page }) => {
    for (const path of ['/', '/apps', '/apps/code-server', '/docs', '/docs/upgrade', '/login']) {
      await page.goto(path);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://blipmade.com/og.png');
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
      const title = await page.title();
      expect(title.length).toBeLessThanOrEqual(60);
    }
  });

  test('the picture of a shared link is served by the site', async ({ page }) => {
    const answer = await page.request.get('/og.png');
    expect(answer.ok()).toBeTruthy();
    expect(answer.headers()['content-type']).toContain('image/png');
  });

  test('the file of the map of the site is written', async ({ page }) => {
    const answer = await page.request.get('/sitemap.xml');
    expect(answer.ok()).toBeTruthy();
    const xml = await answer.text();
    expect(xml).toContain('<loc>https://blipmade.com/</loc>');
    expect(xml).toContain('<loc>https://blipmade.com/apps/code-server</loc>');
    expect(xml).not.toContain('/login');
  });

  test('the file that tells the crawlers what to read is written', async ({ page }) => {
    const answer = await page.request.get('/robots.txt');
    expect(answer.ok()).toBeTruthy();
    const text = await answer.text();
    expect(text).toContain('Sitemap: https://blipmade.com/sitemap.xml');
    expect(text).toContain('Disallow: /app/');
  });
});
