import type { CSSProperties } from "react";
import { ICONS, iconClasses, type IconFamily, type IconName, type IconWeight } from "./icon-map";

/**
 * The icons of the interface.
 *
 * Every icon of the platform is a Font Awesome 7 Pro Duotone icon, and every
 * icon is asked for by its name. The names of the font are written down in
 * the table of the icons, so the interface never carries a class of the icon
 * font by itself.
 *
 * The shape is sharp and duotone by default: the family `fa-sharp-duotone`
 * with the weight `fa-regular`. The classic shape is used where the sharp
 * one does not read well, and the solid weight marks the actions that
 * matter, the selected items of a navigation and the states that are
 * important.
 *
 * The icon font is served by the site itself, under `/fontawesome/`, so the
 * browser asks this site for it and never a third party. The second layer of
 * a duotone icon takes its color from the tokens of the design system, so an
 * icon reads the same in every theme and an error, a warning or a success is
 * still told by the shape of the icon and not only by its color.
 */

export { iconClasses };
export type { IconFamily, IconName, IconWeight };

export interface IconProps {
  /** The name of the icon. */
  name: IconName;
  /** The size of the icon, in pixels or in any unit the style understands. */
  size?: number | string;
  /** The classes of Tailwind and of the design system. */
  className?: string;
  /** The shape of the icon, when the caller needs another one. */
  family?: IconFamily;
  /** The weight of the icon, when the caller needs another one. */
  weight?: IconWeight;
  /**
   * The accessible name of an icon that carries meaning on its own.
   *
   * An icon without a name is decoration: it is hidden from the readers of
   * the screen. An icon with a name is an image with a name, and the control
   * that holds it has to keep its own name too.
   */
  label?: string;
  /** The color of the icon, when it is not the color of the text. */
  color?: string;
  /** The color of the second layer of a duotone icon. */
  secondaryColor?: string;
  /** The opacity of the second layer of a duotone icon, from 0 to 1. */
  secondaryOpacity?: number;
  /** The style of the element, when the caller needs more than the props. */
  style?: CSSProperties;
}

/**
 * An icon of the interface.
 *
 * The icon is a font, so its size is the size of the text of the line it
 * stands in and the line keeps the height it had. The color is the color of
 * the text, unless the caller gives one.
 */
export function Icon({
  name,
  size = 18,
  className,
  family,
  weight,
  label,
  color,
  secondaryColor,
  secondaryOpacity,
  style,
}: IconProps) {
  const variables: Record<string, string> = {};
  if (color) variables["--fa-primary-color"] = color;
  if (secondaryColor) variables["--fa-secondary-color"] = secondaryColor;
  if (secondaryOpacity !== undefined) {
    variables["--fa-secondary-opacity"] = String(secondaryOpacity);
  }

  const inline: CSSProperties = {
    fontSize: typeof size === "number" ? `${size}px` : size,
    ...variables,
    ...style,
  };

  const meaning = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);

  return (
    <i
      className={[iconClasses(name, family, weight), "fa-icon", className]
        .filter(Boolean)
        .join(" ")}
      style={inline}
      {...meaning}
    />
  );
}
