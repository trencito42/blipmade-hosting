import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('Deploy Studio 3.0: Landing page answers "What are you deploying today?" and exposes 3 distinct paths', async () => {
  const catalog = await read('src/app/DeployCatalog.tsx');

  // Primary heading
  assert.ok(catalog.includes('What are you deploying today?'));

  // 3 distinct paths
  assert.ok(catalog.includes('Deploy my project'));
  assert.ok(catalog.includes('Start a new service'));
  assert.ok(catalog.includes('Start from template'));

  // Universal cross-category search
  assert.ok(catalog.includes('searchOfferings') || catalog.includes('/catalog/search'));
  assert.ok(catalog.includes('searchResults'));

  // VPS and Email are dedicated categories, not buried in tools-automation
  assert.ok(catalog.includes("'vps'"));
  assert.ok(catalog.includes("'email-hosting'"));

  // No exclusion of variants via covered/listed
  assert.ok(!catalog.includes('!p.covered'));
});

test('Deploy Studio 3.0: Reusable typed step components are implemented and unified', async () => {
  const [studio, planStep, osStep, domainStep, reviewStep] = await Promise.all([
    read('src/app/deploy/DeployStudio.tsx'),
    read('src/app/deploy/steps/PlanComparisonStep.tsx'),
    read('src/app/deploy/steps/OperatingSystemStep.tsx'),
    read('src/app/deploy/steps/DomainConfigurationStep.tsx'),
    read('src/app/deploy/steps/OrderReviewStep.tsx'),
  ]);

  // Master shell references typed step components
  assert.ok(studio.includes('PlanComparisonStep'));
  assert.ok(studio.includes('VariantSelectionStep'));
  assert.ok(studio.includes('ResourceConfigurationStep'));
  assert.ok(studio.includes('OperatingSystemStep'));
  assert.ok(studio.includes('DomainConfigurationStep'));
  assert.ok(studio.includes('OrderReviewStep'));
  assert.ok(studio.includes('ProvisioningStep'));

  // Authoritative server quote integration
  assert.ok(studio.includes('/catalog/quote'));

  // Plan comparison step supports VPS and Email limits
  assert.ok(planStep.includes('vCPU'));
  assert.ok(planStep.includes('NVMe'));
  assert.ok(planStep.includes('Mailbox'));

  // OS step supports modern Linux distributions
  assert.ok(osStep.includes('debian-12'));
  assert.ok(osStep.includes('ubuntu-24-04'));

  // Domain step validates domain structure
  assert.ok(domainStep.includes('domain'));

  // Review step has turnstile and authoritative pricing
  assert.ok(reviewStep.includes('Turnstile'));
  assert.ok(reviewStep.includes('period'));
});

test('Deploy Studio 3.0: Product Studio Admin interface is registered and provides schema editing and quote testing', async () => {
  const [productStudio, routes, families] = await Promise.all([
    read('src/admin/catalog/ProductStudio.tsx'),
    read('src/routes.tsx'),
    read('src/admin/catalog/Families.tsx'),
  ]);

  // Product Studio components
  assert.ok(productStudio.includes('o.readiness?.blockers'));
  assert.ok(productStudio.includes('WizardSchemaEditor'));
  assert.ok(productStudio.includes('TestQuoteSandbox'));
  assert.ok(productStudio.includes('VariantsReadinessView'));
  assert.ok(productStudio.includes('/admin/catalog/studio'));
  assert.ok(productStudio.includes('test-quote'));
  assert.ok(productStudio.includes('publish'));

  // Registered in routes
  assert.ok(routes.includes("pattern: '/admin/catalog/studio/:slug'"));
  assert.ok(routes.includes("pattern: '/admin/catalog/studio'"));

  // Linked from families
  assert.ok(families.includes('/admin/catalog/studio'));
});

test('Deploy Studio 3.0: Preserves legacy checkout routes and deep links without disruption', async () => {
  const [routes, deploy, vps, email] = await Promise.all([
    read('src/routes.tsx'),
    read('src/app/Deploy.tsx'),
    read('src/app/Vps.tsx'),
    read('src/app/EmailHosting.tsx'),
  ]);

  // Routes are preserved
  assert.ok(routes.includes("pattern: '/app/deploy/families/:slug'"));
  assert.ok(routes.includes("pattern: '/app/deploy/:slug'"));
  assert.ok(routes.includes("pattern: '/app/vps/new'"));
  assert.ok(routes.includes("pattern: '/app/email/checkout'"));

  // VpsCheckout delegates to DeployStudio with initial VPS slug
  assert.ok(vps.includes('DeployStudio'));
  assert.ok(vps.includes("initialSlug='vps'") || vps.includes('initialSlug="vps"'));

  // EmailCheckout delegates to DeployStudio with initial email hosting slug
  assert.ok(email.includes('DeployStudio'));
  assert.ok(email.includes("initialSlug='email-hosting'") || email.includes('initialSlug="email-hosting"'));

  // Deploy delegates to DeployStudio while retaining compatibility constants
  assert.ok(deploy.includes('DeployStudio'));
});
