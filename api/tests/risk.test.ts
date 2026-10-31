import { describe, expect, it } from 'vitest';
import { scoreRisk, type RiskFacts } from '../src/services/risk.js';

const calm: RiskFacts = { ageHours: 24 * 90, emailVerified: true, disposableEmail: false, sharedAddressAccounts: 0, sameIdentityAccounts: 0, failedPayments: 0, ordersLast24h: 0, refunds: 0, openAbuseReports: 0, suspended: false, paidBefore: true };

describe('the risk of an account', () => {
  it('is low for an old, confirmed account that paid before', () => {
    const risk = scoreRisk(calm);
    expect(risk.level).toBe('low');
    expect(risk.score).toBe(0);
  });

  it('adds up what looks wrong and says why', () => {
    const risk = scoreRisk({ ...calm, ageHours: 2, emailVerified: false, disposableEmail: true, sameIdentityAccounts: 1, paidBefore: false });
    expect(risk.level).toBe('high');
    expect(risk.signals.map((signal) => signal.id)).toEqual(expect.arrayContaining(['new', 'unverified', 'disposable', 'same-identity']));
    expect(risk.signals.every((signal) => signal.text.length > 10)).toBe(true);
  });

  it('stays between 0 and 100', () => {
    const worst = scoreRisk({ ...calm, ageHours: 1, emailVerified: false, disposableEmail: true, sharedAddressAccounts: 9, sameIdentityAccounts: 4, failedPayments: 9, ordersLast24h: 9, refunds: 5, openAbuseReports: 3, suspended: true, paidBefore: false });
    expect(worst.score).toBe(100);
    expect(scoreRisk({ ...calm, paidBefore: true, emailVerified: true }).score).toBeGreaterThanOrEqual(0);
  });

  it('is medium for a small number of signals', () => {
    expect(scoreRisk({ ...calm, emailVerified: false, ordersLast24h: 3, paidBefore: false }).level).toBe('medium');
  });
});
