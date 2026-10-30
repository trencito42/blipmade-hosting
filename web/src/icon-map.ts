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
  plus: { name: "plus" },
  minus: { name: "minus" },
  circle: { name: "circle" },
  user: { name: "user" },
  copy: { name: "copy" },
  download: { name: "download" },
  upload: { name: "arrow-up-from-bracket" },
  filePlus: { name: "file-plus" },
  folderOpen: { name: "folder-open" },
  fileZip: { name: "file-zipper" },
  fileImage: { name: "file-image" },
  fileCode: { name: "file-code" },
  filePdf: { name: "file-pdf" },
  file: { name: "file" },
  arrowUp: { name: "arrow-up" },
  lock: { name: "lock" },
  warn: { name: "triangle-exclamation" },
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
  pen: { name: "pen" },
  cut: { name: "scissors" },
  clone: { name: "clone" },
  paste: { name: "paste" },
  trash: { name: "trash" },
  folderPlus: { name: "folder-plus" },
  refresh: { name: "arrows-rotate" },
  ellipsis: { name: "ellipsis" },
  archive: { name: "box-archive" },
  info: { name: "circle-info" },
  server: { name: "server" },
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

/** What the table knows about the icon of a product. */
export interface ProductIconSpec {
  /** The name of the icon in Font Awesome, without the `fa-` prefix. */
  name: string;
  /** The icon is a mark of a brand, from the brand family of the font. */
  brand?: boolean;
}

/**
 * The icons of the products of the catalog, by slug.
 *
 * A product that has a mark in the brand family of the font gets the mark. The
 * font has no mark for a game or for a database like Redis, so those get an
 * icon that says what the product does. A product that is not in the table
 * gets the icon of its category.
 */
export const PRODUCT_ICONS: Record<string, ProductIconSpec> = {
  // Brands the font has.
  'discord-bot': { name: 'discord', brand: true },
  wordpress: { name: 'wordpress', brand: true },
  nodejs: { name: 'node-js', brand: true },
  python: { name: 'python', brand: true },
  java: { name: 'java', brand: true },
  golang: { name: 'golang', brand: true },
  'rust-runtime': { name: 'rust', brand: true },
  postgresql: { name: 'postgresql', brand: true },
  dotnet: { name: 'microsoft', brand: true },
  gitea: { name: 'git-alt', brand: true },
  forgejo: { name: 'git-alt', brand: true },
  'teamspeak-6': { name: 'teamspeak', brand: true },
  // Tools and services.
  'code-server': { name: 'code' },
  mariadb: { name: 'database' },
  mongodb: { name: 'leaf' },
  redis: { name: 'bolt' },
  elasticsearch: { name: 'magnifying-glass' },
  meilisearch: { name: 'magnifying-glass' },
  grafana: { name: 'chart-line' },
  prometheus: { name: 'fire' },
  loki: { name: 'newspaper' },
  'uptime-kuma': { name: 'heart-pulse' },
  nats: { name: 'rss' },
  rabbitmq: { name: 'boxes-stacked' },
  minio: { name: 'hard-drive' },
  'sftp-share': { name: 'folder-arrow-up' },
  'haste-server': { name: 'file-code' },
  reposilite: { name: 'boxes-stacked' },
  owncast: { name: 'video' },
  lavalink: { name: 'music-note' },
  yarr: { name: 'rss' },
  languagetool: { name: 'book-open-reader' },
  '5e-tools': { name: 'dice' },
  'folding-at-home': { name: 'flask' },
  deno: { name: 'code' },
  dart: { name: 'bullseye-arrow' },
  elixir: { name: 'flask' },
  lua: { name: 'brackets-curly' },
  // Games.
  terraria: { name: 'tree' },
  valheim: { name: 'axe-battle' },
  'ark-survival-evolved': { name: 'dragon' },
  'conan-exiles': { name: 'sword' },
  '7-days-to-die': { name: 'skull' },
  dayz: { name: 'biohazard' },
  'project-zomboid': { name: 'virus' },
  'counter-strike-1-6': { name: 'crosshairs' },
  'counter-strike-2': { name: 'crosshairs' },
  cs2d: { name: 'crosshairs' },
  'team-fortress-2': { name: 'bullseye-arrow' },
  'left-4-dead-2': { name: 'ghost' },
  'garrys-mod': { name: 'wrench' },
  rust: { name: 'hammer' },
  factorio: { name: 'gears' },
  satisfactory: { name: 'industry-windows' },
  'space-engineers': { name: 'planet-ringed' },
  stationeers: { name: 'planet-ringed' },
  subnautica: { name: 'fish-fins' },
  'the-forest': { name: 'tree' },
  'sons-of-the-forest': { name: 'tree' },
  unturned: { name: 'campfire' },
  'dont-starve-together': { name: 'campfire' },
  palworld: { name: 'paw-claws' },
  'core-keeper': { name: 'pickaxe' },
  fivem: { name: 'car-side' },
  samp: { name: 'car-side' },
  hytale: { name: 'hat-wizard' },
  'vintage-story': { name: 'wheat-awn' },
};

/**
 * The classes of the icon of a product.
 *
 * The Minecraft editions share one cube. A product the table does not know
 * gets the fallback, which is the icon of its category.
 */
export function productIconClasses(slug: string, fallback: IconName): string {
  const spec: ProductIconSpec | undefined = slug.startsWith('minecraft') ? { name: 'cube' } : PRODUCT_ICONS[slug];
  if (!spec) return iconClasses(fallback);
  return spec.brand ? `fa-brands fa-${spec.name}` : `fa-sharp-duotone fa-regular fa-${spec.name}`;
}
