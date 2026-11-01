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

/** The letters, the digits and the dash, for a variable that says `alpha_dash`. */
const ALPHABET_WITH_DASH = `${ALPHABET}-`;

/**
 * The rules of a variable of an egg, one by one.
 *
 * The panel checks the value of a variable with the rules of the egg, and it
 * refuses the server when the value breaks them: the password of the server of
 * Yarr may only hold letters, numbers and dashes, and the panel answered
 * "The Password variable may only contain letters, numbers, and dashes" to a
 * password that held a "!". A value that the platform makes has to pass the
 * same check.
 */
export function rulesOf(rules: string | undefined | null): string[] {
  return (rules ?? '')
    .split('|')
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0);
}

/**
 * Makes a value for a variable of an egg.
 *
 * The rules of the egg say what the value may hold: `alpha_dash` allows the
 * letters, the numbers and the dash, `alpha_num` the letters and the numbers,
 * `numeric` only the numbers, and `in` says the values that are allowed. The
 * name of the variable says what the value has to look like when the egg says
 * nothing: the token of a Steam server is a number, a password is a text of
 * letters and digits, and anything else is a short text that is safe to put
 * in a container.
 */
export function generatedValueForVariable(
  name: string,
  rules?: string | null,
  wantedLength?: number,
): string {
  const segments = rulesOf(rules);

  const allowed = segments.find((rule) => rule.startsWith('in:'));
  if (allowed) {
    const values = allowed.slice(3).split(',').map((value) => value.trim()).filter(Boolean);
    if (values.length) return values.includes('TRUE') ? 'TRUE' : values[0];
  }

  let alphabet = ALPHABET;
  if (segments.includes('alpha_dash')) alphabet = ALPHABET_WITH_DASH;
  else if (segments.includes('alpha_num')) alphabet = ALPHABET;
  else if (segments.includes('numeric') || segments.includes('integer')) alphabet = DIGITS;

  const upper = name.toUpperCase();
  if (alphabet === ALPHABET) {
    if (upper.includes('GSLT')) alphabet = DIGITS;
    else if (/PASS|SECRET|TOKEN|KEY/.test(upper)) alphabet = ALPHABET;
  }

  let length = alphabet === DIGITS ? 10 : /PASS|SECRET|TOKEN|KEY/.test(upper) ? 20 : 12;
  if (wantedLength !== undefined && Number.isFinite(wantedLength) && wantedLength > 0) {
    length = Math.round(wantedLength);
  }
  const min = segments.find((rule) => rule.startsWith('min:'));
  const max = segments.find((rule) => rule.startsWith('max:'));
  if (min) {
    const wanted = Number(min.slice(4));
    if (Number.isFinite(wanted) && wanted > 0) length = Math.max(length, wanted);
  }
  if (max) {
    const allowedLength = Number(max.slice(4));
    if (Number.isFinite(allowedLength) && allowedLength > 0) length = Math.min(length, allowedLength);
  }
  if (length < 1) length = 1;

  let value = randomFrom(alphabet, length);

  // The eggs of the games ask for the name of a file of the server, and their
  // rule is a pattern that ends with ".jar". A value that does not end that
  // way is refused by the panel.
  const pattern = segments.find((rule) => rule.startsWith('regex:'));
  if (pattern && pattern.includes('\\.jar') && !value.endsWith('.jar')) {
    value = `${value}.jar`;
  }

  return value;
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
    const rules = rulesOf(spec.rules);
    if (!rules.includes('required')) continue;
    const value = filled[spec.env_variable];
    if (value !== undefined && value !== '') continue;
    filled[spec.env_variable] = generatedValueForVariable(spec.env_variable, spec.rules);
  }
  return filled;
}
