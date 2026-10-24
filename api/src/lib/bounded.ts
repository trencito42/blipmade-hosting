/**
 * The bounds of the collections that come from the client.
 *
 * zod checks the length of an array before it walks the elements, so an
 * array with a limit cannot make the validation expensive: the limit is
 * reached before the elements are read. A record has no such limit in this
 * version of zod, so the number of its keys is counted before the values
 * are read, and the body is refused without the cost of walking it.
 */
import { z } from 'zod';

/** The option codes that one line of a quote or of an order may carry. */
export const MAX_OPTION_CODES = 50;

/** The lines that a quote or an order may have. */
export const MAX_ORDER_LINES = 20;

/** The environment variables that one instance may carry. */
export const MAX_ENVIRONMENT_VARIABLES = 100;

/** The keys of the payload of a schedule. */
export const MAX_PAYLOAD_KEYS = 100;

/** The startup variables that one product may carry. */
export const MAX_STARTUP_VARIABLES = 100;

/** The settings that one request may write. */
export const MAX_SETTINGS = 200;

/** Whether the value is an object that is not an array. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The error of a validation error, with the field that is too large. */
function tooManyKeys(path: string[], label: string, max: number): z.ZodError {
  return new z.ZodError([
    { code: z.ZodIssueCode.custom, path, message: `${label} has more than ${max} keys.` },
  ]);
}

/**
 * Refuses a body whose named fields hold more keys than they may.
 *
 * The keys are counted before the schema reads the values, so a field that
 * is too large is refused without the cost of walking it. The error is the
 * one of a validation error, so the client gets the same answer it gets for
 * any other field that is not right.
 */
export function assertBoundedFields(
  body: unknown,
  limits: Record<string, { max: number; label: string }>,
): void {
  if (!isPlainObject(body)) return;
  for (const [field, limit] of Object.entries(limits)) {
    const value = body[field];
    if (isPlainObject(value) && Object.keys(value).length > limit.max) {
      throw tooManyKeys([field], limit.label, limit.max);
    }
  }
}

/**
 * A record with a limit on the number of keys.
 *
 * The error is the one of a validation error, so the client gets the same
 * answer it gets for any other field that is not right.
 */
export function boundedRecord<T extends z.ZodTypeAny>(
  value: T,
  max: number,
  label = 'The object',
) {
  return z.preprocess((input) => {
    if (isPlainObject(input) && Object.keys(input).length > max) {
      throw tooManyKeys([], label, max);
    }
    return input;
  }, value);
}
