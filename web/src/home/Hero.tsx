import { useEffect, useState } from 'react';
import { cn, useReducedMotion } from '../lib';
import { Arrow, Button, Reveal, Wrap } from '../ui';
import { useRouter } from '../router';

/**
 * The opening of the public site.
 *
 * The headline is written word by word, and the terminal on the right types
 * the command of a deployment. The terminal is a picture: it is hidden from
 * the assistive technology, because it describes nothing that the platform
 * does not do.
 */
const SCRIPT: { t: string; k: 'cmd' | 'ok' | 'dim' | 'live' }[] = [
  { t: 'blip deploy my-bot', k: 'cmd' },
  { t: 'Pulling latest from git', k: 'dim' },
  { t: 'Installing dependencies', k: 'ok' },
  { t: 'Running: node index.js', k: 'ok' },
  { t: 'my-bot is online', k: 'live' },
];

function Terminal() {
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? SCRIPT.length : 0);
  const [typed, setTyped] = useState(reduced ? SCRIPT[0]!.t.length : 0);

  useEffect(() => {
    if (reduced) return;
    const typing = n === 0 && typed < SCRIPT[0]!.t.length;
    const id = setTimeout(
      () => {
        if (typing) setTyped(typed + 1);
        else if (n < SCRIPT.length) setN(n + 1);
        else {
          setN(0);
          setTyped(0);
        }
      },
      typing ? 55 : n === 0 ? 500 : n < SCRIPT.length ? 650 : 3600,
    );
    return () => clearTimeout(id);
  }, [n, typed, reduced]);

  const shown = n === 0 ? [] : SCRIPT.slice(1, n);

  return (
    <div aria-hidden="true" data-decorative className="overflow-hidden rounded-2xl border border-line bg-s1 shadow-[0_30px_80px_-40px_rgb(0_0_0)]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        <span className="ml-3 font-mono text-[12px] text-ink3">my-bot</span>
      </div>
      <div className="min-h-[236px] p-5 font-mono text-[13.5px] leading-7">
        <p>
          <span className="text-acc">$</span> {SCRIPT[0]!.t.slice(0, typed)}
          {n === 0 && <span className="cursor ml-0.5 inline-block h-4 w-2 translate-y-0.5 bg-ink" />}
        </p>
        {shown.map((line, i) => (
          <p key={i} className={cn('card-in', line.k === 'dim' && 'text-ink3', line.k === 'ok' && 'text-ink2', line.k === 'live' && 'text-acc-h')}>
            {line.k === 'live' ? (
              <span className="mr-2 inline-block size-2 rounded-full bg-acc-h shadow-[0_0_10px_#39ff88]" />
            ) : (
              <span className="mr-2 text-acc">✓</span>
            )}
            {line.t}
          </p>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  const { navigate } = useRouter();
  const words = ['Host', 'anything', 'that', 'runs', 'on', 'a', 'panel.'];
  return (
    <section aria-label="Blipmade" className="dots relative overflow-hidden pt-36 pb-24 sm:pt-44">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
      <Wrap className="relative grid items-center gap-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="grid gap-8">
          <h1 className="text-[clamp(44px,6.6vw,92px)] leading-[0.98] font-semibold tracking-[-0.045em] [text-wrap:balance]">
            {words.map((word, i) => (
              <span key={i} className="rv mr-[0.22em] inline-block" style={{ ['--d' as string]: 80 + i * 70 }} data-in="">
                {word}
              </span>
            ))}
          </h1>
          <Reveal delay={700} className="grid gap-8">
            <p className="max-w-xl text-[19px] leading-relaxed text-ink2">
              Game servers, Discord bots, apps and databases on one clean panel. Pick your resources, choose what you run, and deploy in
              seconds.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => navigate('/register')}>
                Get started <Arrow />
              </Button>
              <Button size="lg" variant="soft" onClick={() => navigate('/apps')}>
                View plans
              </Button>
            </div>
          </Reveal>
        </div>
        <Reveal delay={400}>
          <div className="drift">
            <Terminal />
          </div>
        </Reveal>
      </Wrap>
    </section>
  );
}
