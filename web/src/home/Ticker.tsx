import { Icon, type IconName } from '../icons';
import { cn, useReducedMotion, useScrollY } from '../lib';

const A: [IconName, string][] = [['globe', 'WordPress'], ['doc', 'Ghost'], ['code', 'Forgejo'], ['mon', 'Uptime Kuma'], ['flow', 'n8n'], ['bot', 'Discord bots'], ['db', 'PostgreSQL'], ['bolt', 'Redis']];
const B: [IconName, string][] = [['term', 'Live logs'], ['folder', 'Files'], ['globe', 'Domains'], ['chart', 'Usage'], ['card', 'Billing'], ['rocket', 'Upgrades'], ['shield', 'Your resources'], ['box', 'No VPS']];
const TONE = ['bg-acc text-on-acc', 'bg-s1 text-ink', 'bg-ink text-bg', 'bg-s2 text-ink'];

/** Two rows of chips that slide in opposite directions as you scroll. Decorative. */
export function Ticker() {
  const y = useScrollY();
  const reduced = useReducedMotion();
  const row = (items: [IconName, string][], dir: 1 | -1, off: number) => (
    <div className="whitespace-nowrap will-change-transform" style={{ transform: `translate3d(${reduced ? off : dir * y * 0.3 + off}px,0,0)` }}>
      {[...items, ...items, ...items].map(([ic, t], i) => (
        <span key={i} className={cn('mr-3 inline-flex h-14 items-center gap-3 rounded-full px-6 text-[clamp(19px,2.3vw,30px)] font-extrabold tracking-[-0.045em] sm:mr-4 sm:h-16 sm:px-7', TONE[i % 4])} style={{ rotate: `${((i % 3) - 1) * 0.9}deg` }}><Icon name={ic} size={24} />{t}</span>
      ))}
    </div>
  );
  return (
    <div aria-hidden="true" data-decorative className="grid select-none gap-3 overflow-hidden py-14 sm:py-16">
      {row(A, -1, 0)}
      {row(B, 1, -900)}
    </div>
  );
}
