import { randomInt } from 'node:crypto';

/**
 * The values the platform makes for the variables of an egg that have to be
 * filled and that carry no value of their own.
 *
 * The panel refuses to create a server whose environment leaves a variable
 * that the egg marks as required empty. The refusal is right: the variable
 * reaches the container, and an empty one leaves the service without the
 * thing it needs (the password of the database, the token of the game). The
 * eggs of games ask for such a variable without giving it a value: the token
 * of the server of Unturned is the one. The server of that game was refused
 * with "The GSLT variable field is required", so the product could not be
 * built at all.
 *
 * The platform therefore fills these variables with a value it makes, in the
 * same way it makes the passwords of the products it sells.
 */

/** The letters and the digits a made value is made of. */
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** The digits a made value is made of, when the variable asks for a number. */
const DIGITS = '0123456789';

/**
 * Makes a value for a variable of an egg.
 *
 * The name of the variable says what the value has to look like: the token of
 * a Steam server is a number, a password is a text of letters and digits, and
 * anything else is a short text that is safe to put in a container.
 */
export function generatedValueForVariable(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes('GSLT')) return randomFrom(DIGITS, 10);
  if (/PASS|SECRET|TOKEN|KEY/.test(upper)) return randomFrom(ALPHABET, 20);
  return randomFrom(ALPHABET, 12);
}

/** Makes a text of a given length out of the letters given. */
function randomFrom(alphabet: string, length: number): string {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += alphabet[randomInt(alphabet.length)];
  }
  return value;
}

/** What the platform knows about one variable of an egg. */
export interface EggVariableSpec {
  /** The name of the variable, as the egg writes it. */
  env_variable: string;
  /** The value the variable has when nobody says otherwise. */
  default_value: string | null;
  /** The rules the panel checks the value with. */
  rules?: string;
}

/**
 * Fills the variables of an egg that have to be filled and that are empty.
 *
 * A value the customer gave or the platform made is never touched: the
 * environment is read as it is, and only the values that are missing are
 * made.
 */
export function fillRequiredVariables(
  environment: Record<string, string>,
  specs: EggVariableSpec[],
): Record<string, string> {
  const filled = { ...environment };
  for (const spec of specs) {
    if (!spec.env_variable) continue;
    const rules = (spec.rules ?? '')
      .split('|')
      .map((rule) => rule.trim());
    if (!rules.includes('required')) continue;
    const value = filled[spec.env_variable];
    if (value !== undefined && value !== '') continue;
    filled[spec.env_variable] = generatedValueForVariable(spec.env_variable);
  }
  return filled;
}
