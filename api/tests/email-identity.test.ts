import { describe, expect, it } from 'vitest';
import { emailIdentity, isDisposableEmail } from '../src/lib/email-identity.js';

describe('email identity', () => {
  it('collapses Gmail dots, tags and googlemail aliases', () => {
    expect(emailIdentity('Ste.Fan+launch@GoogleMail.com')).toBe('stefan@gmail.com');
    expect(emailIdentity('stefan@gmail.com')).toBe('stefan@gmail.com');
  });

  it('collapses plus aliases only for known providers', () => {
    expect(emailIdentity('name+launch@outlook.com')).toBe('name@outlook.com');
    expect(emailIdentity('name+real@example.com')).toBe('name+real@example.com');
  });

  it('matches configured disposable domains and their subdomains', () => {
    expect(isDisposableEmail('one@mail.temp.example', 'temp.example, throw.test')).toBe(true);
    expect(isDisposableEmail('one@example.com', 'temp.example, throw.test')).toBe(false);
  });
});
