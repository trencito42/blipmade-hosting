/**
 * The name of a person.
 *
 * A customer has two names, both required, and nothing is ever invented: the
 * panel account of a customer carries the same two parts. The screens that
 * show one line use `fullName`, which is the only place the two parts are
 * joined.
 */

export interface NamedPerson {
  firstName: string;
  lastName: string;
}

/** The two parts of a name, as one line. */
export function fullName(person: NamedPerson): string {
  return `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();
}

/** The first letter of a name, for an avatar. */
export function initial(person: NamedPerson): string {
  return (person.firstName ?? '').trim().charAt(0).toUpperCase() || '?';
}
