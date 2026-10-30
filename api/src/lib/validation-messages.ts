import type { ZodIssue } from 'zod';

/**
 * Turns the failures of a schema into sentences a person can act on: which field, and what is
 * wrong with it ("City is required.", "Postal code is too long (at most 30 characters)."),
 * instead of the default wording of the library or one generic line.
 */
const LABELS: Record<string, string> = {
  fullName: 'Full name',
  companyName: 'Company',
  line1: 'Address line 1',
  line2: 'Address line 2',
  postalCode: 'Postal code',
  country: 'Country code',
  taxId: 'VAT / tax ID',
  firstName: 'First name',
  lastName: 'Last name',
  currentPassword: 'Current password',
  newPassword: 'New password',
  sshPublicKey: 'SSH public key',
  vpsName: 'Server name',
};

export function labelOf(path: (string | number)[]): string {
  const last = String(path[path.length - 1] ?? 'form');
  if (LABELS[last]) return LABELS[last]!;
  const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function describeIssue(issue: ZodIssue): string {
  const label = labelOf(issue.path);
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' || issue.received === 'null' ? `${label} is required.` : `${label} has the wrong format.`;
    case 'too_small':
      if (issue.type === 'string' || issue.type === 'array') {
        const min = Number(issue.minimum);
        return min <= 1 ? `${label} cannot be empty.` : `${label} needs at least ${min} ${issue.type === 'string' ? 'characters' : 'items'}.`;
      }
      return `${label} must be at least ${String(issue.minimum)}.`;
    case 'too_big':
      if (issue.type === 'string') return `${label} is too long (at most ${String(issue.maximum)} characters).`;
      return `${label} must be at most ${String(issue.maximum)}.`;
    case 'invalid_string':
      if (issue.validation === 'email') return `${label} is not a valid email address.`;
      if (issue.validation === 'url') return `${label} is not a valid address.`;
      // A rule the schema wrote its own message for keeps that message.
      return issue.message && issue.message !== 'Invalid' ? issue.message : `${label} has the wrong format.`;
    case 'invalid_enum_value':
      return `${label} must be one of: ${issue.options.join(', ')}.`;
    case 'custom':
      return issue.message || `${label} is not valid.`;
    default:
      return issue.message && issue.message !== 'Invalid input' ? issue.message : `${label} is not valid.`;
  }
}

/** The sentence for each field that failed, and one line for the top of the form that names them. */
export function describeIssues(issues: ZodIssue[]): { fields: Record<string, string>; message: string } {
  const fields: Record<string, string> = {};
  const labels: string[] = [];
  for (const issue of issues) {
    const key = issue.path.join('.') || 'form';
    if (fields[key]) continue;
    fields[key] = describeIssue(issue);
    labels.push(labelOf(issue.path));
  }
  const sentences = Object.values(fields);
  const message =
    sentences.length === 1
      ? sentences[0]!
      : `Please fix ${sentences.length} fields: ${labels.slice(0, 4).join(', ')}${labels.length > 4 ? '…' : ''}.`;
  return { fields, message };
}
