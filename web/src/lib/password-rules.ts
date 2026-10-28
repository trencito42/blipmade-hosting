/**
 * The rules of a password, the same ones the API enforces.
 *
 * The API keeps its rules in `api/src/lib/password.ts`. The words below are
 * the same rules, written for a person who is typing: the checklist under
 * the field tells the visitor what is still missing, so the account is not
 * sent to the server only to be refused.
 *
 * The list is a checklist and not a bar: a bar says how strong a password
 * is, and strength is not what the server measures. The server measures the
 * rules, and these are the rules.
 */

/** The shortest password the API accepts. */
export const PASSWORD_MIN_LENGTH = 10;

/** The longest password the API accepts. */
export const PASSWORD_MAX_LENGTH = 200;

/** One rule of the checklist, and the words that describe it. */
export interface PasswordRule {
  /** The sentence shown under the field. */
  label: string;
  /** Whether the value keeps the rule. */
  ok: (value: string) => boolean;
}

/** The rules of the API, in the order they are shown. */
export const PASSWORD_RULES: PasswordRule[] = [
  { label: '10 characters or more', ok: (v) => v.length >= PASSWORD_MIN_LENGTH },
  { label: 'a lowercase letter', ok: (v) => /[a-z]/.test(v) },
  { label: 'an uppercase letter', ok: (v) => /[A-Z]/.test(v) },
  { label: 'a number', ok: (v) => /[0-9]/.test(v) },
  { label: '200 characters or fewer', ok: (v) => v.length <= PASSWORD_MAX_LENGTH },
];

/** The rules the value does not keep yet, in words. */
export function passwordIssues(value: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.ok(value)).map((rule) => rule.label);
}

/** The whole sentence under the field, for the screens that show one line. */
export function passwordHelper(value: string): string {
  if (!value) {
    return 'At least 10 characters, with an uppercase letter, a lowercase letter and a number.';
  }
  const issues = passwordIssues(value);
  if (issues.length === 0) {
    return 'Strong password: at least 10 characters, with an uppercase letter, a lowercase letter and a number.';
  }
  return `Still needed: ${issues.join(', ')}.`;
}
