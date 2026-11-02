import styles from './HamburgerIcon.module.css';

/**
 * The hamburger of the mobile menus, which turns into an X while the menu is open.
 *
 * It has no state of its own: `open` is the state of the menu that holds it, so the icon cannot disagree with the menu.
 * The colour is `currentColor`, so it follows the theme of the button it sits in. The paths and the timing are the ones
 * of the supplied animation, kept as they are.
 */
export function HamburgerIcon({ open, size = 35, className }: { open: boolean; size?: number; className?: string }) {
  return (
    <svg
      className={[`fill-current`, styles.icon, open ? styles.opened : '', className].filter(Boolean).join(' ')}
      width={`${size}px`}
      height={`${size}px`}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className={`${styles.line} ${styles.line1} stroke-current`}
        d="M 20,29.000046 H 80.000231 C 80.000231,29.000046 94.498839,28.817352 94.532987,66.711331 94.543142,77.980673 90.966081,81.670246 85.259173,81.668997 79.552261,81.667751 75.000211,74.999942 75.000211,74.999942 L 25.000021,25.000058"
      />
      <path className={`${styles.line} ${styles.line2} stroke-current`} d="M 20,50 H 80" />
      <path
        className={`${styles.line} ${styles.line3} stroke-current`}
        d="M 20,70.999954 H 80.000231 C 80.000231,70.999954 94.498839,71.182648 94.532987,33.288669 94.543142,22.019327 90.966081,18.329754 85.259173,18.331003 79.552261,18.332249 75.000211,25.000058 75.000211,25.000058 L 25.000021,74.999942"
      />
    </svg>
  );
}
