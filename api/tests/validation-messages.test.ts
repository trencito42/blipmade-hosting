import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { describeIssues, labelOf } from '../src/lib/validation-messages.js';
import { databasesIncluded } from '../src/lib/plan-limits.js';

const schema = z.object({
  fullName: z.string().trim().min(2),
  line1: z.string().trim().min(3).max(10),
  email: z.string().email(),
  country: z.string().regex(/^[A-Z]{2}$/, 'Country code must be two letters, for example RO.'),
});

describe('the sentences of a failed validation', () => {
  it('names each field and what is wrong with it', () => {
    const result = schema.safeParse({ fullName: '', line1: 'much too long for this', email: 'nope', country: 'ro' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const { fields, message } = describeIssues(result.error.issues);
    expect(fields.fullName).toBe('Full name needs at least 2 characters.');
    expect(fields.line1).toBe('Address line 1 is too long (at most 10 characters).');
    expect(fields.email).toBe('Email is not a valid email address.');
    expect(fields.country).toBe('Country code must be two letters, for example RO.');
    expect(message).toBe('Please fix 4 fields: Full name, Address line 1, Email, Country code.');
  });

  it('says that a missing field is required, and uses one sentence for a single problem', () => {
    const result = schema.safeParse({ line1: 'abcd', email: 'a@b.co', country: 'RO' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const { fields, message } = describeIssues(result.error.issues);
    expect(fields.fullName).toBe('Full name is required.');
    expect(message).toBe('Full name is required.');
  });

  it('turns the name of a field into words', () => {
    expect(labelOf(['sshPublicKey'])).toBe('SSH public key');
    expect(labelOf(['someNewField'])).toBe('Some new field');
  });
});

describe('the databases a plan includes', () => {
  it('is one up to 2 GB of memory and two above', () => {
    expect(databasesIncluded(512)).toBe(1);
    expect(databasesIncluded(2048)).toBe(1);
    expect(databasesIncluded(4096)).toBe(2);
    expect(databasesIncluded(16384)).toBe(2);
  });
});
