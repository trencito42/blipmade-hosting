/**
 * The table of the icons of the interface.
 *
 * Every icon of the platform is a Font Awesome 7 Pro Duotone icon, and every
 * icon is asked for by its name. The name is translated to the classes of the
 * icon font in one place, so a change of the font is a change of one place
 * and not of the whole interface.
 *
 * The table is a module of its own, without any markup, so the tests can
 * read it and check that every name of it is an icon the installed font
 * really has.
 */

/** The shape of an icon: the sharp one or the classic one. */
export type IconFamily = "sharp" | "classic";

/** The weight of an icon. */
export type IconWeight = "regular" | "solid";

/** What the table of the icons knows about an icon. */
export interface IconSpec {
  /** The name of the icon in Font Awesome, without the `fa-` prefix. */
  name: string;
  /** The shape of the icon, when it is not the sharp one. */
  family?: IconFamily;
  /** The weight of the icon, when it is not the regular one. */
  weight?: IconWeight;
}

/**
 * The table of the icons.
 *
 * Every name of this table is a name the interface asks for. The names of the
 * font are written down here and nowhere else, so the interface never
 * carries a class of the icon font by itself.
 */
export const ICONS = {
  arrow: { name: "arrow-right" },
  arrowUR: { name: "arrow-up-right-from-square" },
  check: { name: "check" },
  search: { name: "magnifying-glass" },
  menu: { name: "bars" },
  close: { name: "xmark" },
  chevronDown: { name: "chevron-down" },
  eye: { name: "eye" },
  eyeOff: { name: "eye-slash" },
  globe: { name: "globe" },
  db: { name: "database" },
  folder: { name: "folder" },
  term: { name: "terminal" },
  chart: { name: "chart-simple" },
  card: { name: "credit-card" },
  rocket: { name: "rocket" },
  shield: { name: "shield-halved" },
  restart: { name: "rotate-right" },
  box: { name: "cube" },
  bolt: { name: "bolt" },
  bot: { name: "robot" },
  mon: { name: "chart-line" },
  flow: { name: "diagram-project" },
  code: { name: "code" },
  doc: { name: "file-lines" },
  game: { name: "gamepad" },
  mail: { name: "envelope" },
  bell: { name: "bell" },
  heart: { name: "heart-pulse" },
} as const satisfies Record<string, IconSpec>;

/** The names of the icons of the interface. */
export type IconName = keyof typeof ICONS;

/** The names of every icon of the table, one by one. */
export function iconNames(): IconName[] {
  return Object.keys(ICONS) as IconName[];
}

/**
 * The classes of an icon.
 *
 * The family and the weight are two different things: the family says which
 * shape the icon has and the weight says how much of the color it carries.
 */
export function iconClasses(
  name: IconName,
  family?: IconFamily,
  weight?: IconWeight,
): string {
  const spec = ICONS[name] as IconSpec;
  const shape = family ?? spec.family ?? "sharp";
  const style = weight ?? spec.weight ?? "regular";
  return [
    shape === "classic" ? "fa-duotone" : "fa-sharp-duotone",
    style === "solid" ? "fa-solid" : "fa-regular",
    `fa-${spec.name}`,
  ].join(" ");
}
