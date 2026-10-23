import { createElement, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { cn, useInView } from './lib';
import { Icon, type IconName } from './icons';
import { Link } from './router';
import logo from './logo.svg';

export const Wrap = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('mx-auto w-full max-w-[1280px] px-4 sm:px-6', className)}>{children}</div>
);

export function Reveal({ delay = 0, className, children, as = 'div' }: { delay?: number; className?: string; children: ReactNode; as?: ElementType }) {
  const [ref, seen] = useInView<HTMLElement>();
  return createElement(as, { ref, className: cn('rv', className), style: { '--d': delay } as CSSProperties, 'data-in': seen ? '' : undefined }, children);
}

/** Headline that rises line by line. One array item per visual line. */
export function Headline({ as = 'h2', lines, className, hidden }: { as?: 'h1' | 'h2' | 'div'; lines: ReactNode[]; className?: string; hidden?: boolean }) {
  const [ref, seen] = useInView<HTMLElement>('0px 0px -8% 0px');
  return createElement(
    as,
    { ref, 'data-in': seen ? '' : undefined, 'aria-hidden': hidden || undefined, className: cn('font-extrabold tracking-[-0.06em] [text-wrap:balance]', className) },
    lines.map((l, i) => (
      <span key={i} className="ln" style={{ '--i': i } as CSSProperties}>
        <span>{l}</span>
      </span>
    )),
  );
}

/**
 * The look of a slider.
 *
 * The control is 44px tall and the track is drawn inside that height, so the
 * finger has room to drag it on a phone. The thumb keeps the size it had.
 */
export const rangeInput =
  'h-11 w-full cursor-pointer appearance-none bg-transparent ' +
  '[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-s3 ' +
  '[&::-webkit-slider-thumb]:mt-[-10px] [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none ' +
  '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-s1 [&::-webkit-slider-thumb]:bg-acc ' +
  '[&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-s3 ' +
  '[&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-s1 [&::-moz-range-thumb]:bg-acc';

export const Eyebrow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cn('font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-acc', className)}>{children}</span>
);

const V = {
  pri: 'bg-acc text-on-acc hover:bg-acc-h',
  ink: 'bg-ink text-bg hover:opacity-90',
  soft: 'bg-s3 text-ink hover:bg-line',
  ghost: 'bg-transparent text-ink2 hover:text-ink',
} as const;
type BtnProps = { to?: string; href?: string; onClick?: () => void; variant?: keyof typeof V; size?: 'md' | 'lg'; icon?: IconName; children: ReactNode; className?: string; type?: 'button' | 'submit'; disabled?: boolean; full?: boolean };
export function Button({ to, href, onClick, variant = 'pri', size = 'md', icon, children, className, type = 'button', disabled, full }: BtnProps) {
  const cls = cn(
    'group inline-flex items-center justify-center gap-2 rounded-full font-bold tracking-[-0.01em] whitespace-nowrap outline-none transition-[background-color,color,transform,opacity] duration-[180ms] focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50',
    size === 'lg' ? 'h-14 px-7 text-[16px]' : 'h-11 px-5 text-[14.5px]',
    full && 'w-full',
    V[variant],
    className,
  );
  const inner = (
    <>
      {children}
      {icon && <Icon name={icon} size={size === 'lg' ? 18 : 16} className="transition-transform duration-[180ms] group-hover:translate-x-0.5" />}
    </>
  );
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (href) return <a href={href} className={cls}>{inner}</a>;
  return <button type={type} onClick={onClick} disabled={disabled} className={cls}>{inner}</button>;
}

export const Logo = ({ className }: { className?: string }) => (
  <Link to="/" aria-label="Blipmade home" className={cn('flex items-center gap-2.5 rounded-full text-[21px] font-extrabold tracking-[-0.055em] outline-none focus-visible:ring-2 focus-visible:ring-acc', className)}>
    <img src={logo} alt="" className="h-6 w-auto" />
    blipmade
  </Link>
);

export function StatusDot({ live = true }: { live?: boolean }) {
  return <span aria-hidden="true" className={cn('relative inline-block size-2 rounded-full bg-acc text-acc', live && 'bm-ping')} />;
}

/** App icon on a flat tile. `acc` is for use on green surfaces. */
export function AppMark({ icon, size = 40, tone = 'dark' }: { icon: IconName; size?: number; tone?: 'dark' | 'acc' | 'lit' }) {
  return (
    <span style={{ width: size, height: size }} className={cn('grid shrink-0 place-items-center rounded-[28%]', tone === 'acc' ? 'bg-on-acc/12 text-on-acc' : tone === 'lit' ? 'bg-acc text-on-acc' : 'bg-s3 text-acc')}>
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}
