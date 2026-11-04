import { describe, expect, it } from 'vitest';
import { buildQuote } from '../src/services/pricing.js';

describe('order import source persistence', () => {
  it('carries importSourceId and managedImport through buildQuote', async () => {
    const quote = await buildQuote([
      {
        productSlug: 'nodejs',
        ram: 2048,
        cpu: 1,
        disk: 10,
        importSourceId: 'cmw1test0001import0001',
        managedImport: true,
      },
    ]);
    expect(quote.items[0]?.importSourceId).toBe('cmw1test0001import0001');
    expect(quote.items[0]?.managedImport).toBe(true);
  });
});
