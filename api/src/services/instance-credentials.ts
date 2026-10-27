import { randomInt } from 'node:crypto';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';

/**
 * The variables the platform makes for an instance.
 *
 * Some eggs ask for a password in their own variables, and the panel refuses
 * a server whose environment does not carry it. The default of the egg is the
 * same for every customer, so it cannot be used: two customers would hold the
 * same password, and everybody who knows it could reach the database of
 * everybody else.
 *
 * The platform therefore makes one value per instance. The value is written in
 * the environment of the container, so the application reads it, and it is kept
 * on the instance, encrypted, so the owner of the instance can read it in the
 * console.
 *
 * The product declares which variables it needs:
 *
 *     { "PGPASSWORD": { "length": 20, "label": "Password of the database" } }
 */

/** The letters and the digits a made password is built from. */
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** The longest value an egg of the platform accepts. */
const MAX_LENGTH = 32;

/** The shortest value that is still a password. */
const MIN_LENGTH = 12;

/** What a product says about one variable it needs. */
export interface GeneratedVariableSpec {
  /** How long the value is. The rule of the egg is the limit. */
  length?: number;
  /** The name the owner of the instance reads. */
  label?: string;
}

/** The variables a product needs, by their name. */
export type GeneratedVariableSpecs = Record<string, GeneratedVariableSpec>;

/**
 * Reads the declaration of a product.
 *
 * A declaration that is not an object of names is ignored, so a product that
 * was written by an older version of the platform still works.
 */
export function parseGeneratedVariableSpecs(value: unknown): GeneratedVariableSpecs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const specs: GeneratedVariableSpecs = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) continue;
    const spec = (raw ?? {}) as GeneratedVariableSpec;
    const length = Number(spec.length);
    specs[name] = {
      length: Number.isFinite(length) ? Math.min(Math.max(Math.round(length), MIN_LENGTH), MAX_LENGTH) : 20,
      label: typeof spec.label === 'string' && spec.label.trim() !== '' ? spec.label.trim().slice(0, 120) : name,
    };
  }
  return specs;
}

/** Makes a password of a given length. */
export function generateSecret(length: number): string {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += ALPHABET[randomInt(ALPHABET.length)];
  }
  return value;
}

/** Makes one value for every variable the product declares. */
export function generateVariables(specs: GeneratedVariableSpecs): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, spec] of Object.entries(specs)) {
    values[name] = generateSecret(spec.length ?? 20);
  }
  return values;
}

/** Puts the values of an instance in a form that can be kept in the database. */
export function sealVariables(values: Record<string, string>): string {
  return encryptSecret(JSON.stringify(values));
}

/**
 * Reads the values of an instance.
 *
 * A value that was written with another secret cannot be read. It is then
 * reported as missing, so the console shows that the value has to be changed
 * instead of showing an empty field.
 */
export function openVariables(payload: string | null | undefined): Record<string, string> | null {
  if (!payload) return null;
  const plain = decryptSecret(payload);
  if (!plain) return null;
  try {
    const parsed = JSON.parse(plain) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const values: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') values[name] = value;
    }
    return values;
  } catch {
    return null;
  }
}
