import { useEffect, useRef, useState } from 'react';
import { cn, useReducedMotion } from '../lib';
import { Button, Reveal, Wrap } from '../ui';

/**
 * The panel of the platform.
 *
 * A picture of what the customer gets: the buttons of an instance, the
 * meters of its resources and the console it writes to. The buttons work, so
 * the customer can see how the panel answers. The numbers of the meters are
 * an illustration of a running server, not a measurement of this platform.
 */

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[12.5px] text-ink2">
        <span>{label}</span>
        <span className="font-mono">{value}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-acc transition-[width] duration-700 ease-out-expo" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function PanelPreview() {
  const reduced = useReducedMotion();
  const [on, setOn] = useState(true);
  const [log, setLog] = useState<string[]>(['Starting my-bot', 'Connected to gateway', 'Ready in 1.4s']);
  const [tick, setTick] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!on || reduced) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1800);
    return () => clearInterval(timer);
  }, [on, reduced]);

  useEffect(() => { box.current?.scrollTo({ top: 9999 }); }, [log]);

  const act = (action: 'start' | 'restart' | 'stop') => {
    if (action === 'stop') {
      setOn(false);
      setLog((lines) => [...lines, 'Stopping my-bot', 'Stopped']);
      return;
    }
    setOn(true);
    setLog((lines) => [...lines, action === 'restart' ? 'Restarting my-bot' : 'Starting my-bot', 'Ready in 1.2s']);
  };

  const cpu = on ? 12 + ((tick * 7) % 19) : 0;
  const ram = on ? 38 + ((tick * 3) % 9) : 0;

  return (
    <section id="panel" aria-label="Control panel" className="py-24">
      <Wrap className="grid gap-12">
        <Reveal className="grid gap-4">
          <h2 className="max-w-3xl text-[clamp(34px,4.6vw,60px)] leading-[1.02] font-semibold tracking-[-0.04em] [text-wrap:balance]">
            One clean panel for everything you run.
          </h2>
          <p className="max-w-xl text-[17px] text-ink2">Start, restart and stop. Read the console. Try it.</p>
        </Reveal>
        <Reveal delay={100}>
          <div className="overflow-hidden rounded-2xl border border-line bg-s1 shadow-[0_40px_100px_-50px_rgb(34_197_94/0.35)]">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
              <span className="ml-3 rounded-md bg-card px-3 py-1 font-mono text-[12px] text-ink3">my-bot</span>
            </div>
            <div className="grid md:grid-cols-[200px_minmax(0,1fr)]">
              <nav aria-label="Panel sections (preview)" className="hidden border-r border-line p-3 md:block">
                {['Console', 'Files', 'Startup', 'Settings'].map((section, i) => (
                  <p key={section} className={cn('rounded-lg px-3 py-2 text-[14px]', i === 0 ? 'bg-card text-ink' : 'text-ink3')}>
                    {section}
                  </p>
                ))}
              </nav>
              <div className="grid gap-5 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-[18px] font-semibold">my-bot</h3>
                    <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium', on ? 'bg-acc/15 text-acc-h' : 'bg-line text-ink2')}>
                      <span className={cn('size-1.5 rounded-full', on ? 'bg-acc-h' : 'bg-ink3')} />
                      {on ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="soft" onClick={() => act('start')} disabled={on}>Start</Button>
                    <Button variant="soft" onClick={() => act('restart')}>Restart</Button>
                    <Button variant="soft" onClick={() => act('stop')} disabled={!on}>Stop</Button>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Meter label="CPU" value={cpu} />
                  <Meter label="Memory" value={ram} />
                  <Meter label="Disk" value={21} />
                </div>
                <div ref={box} role="log" aria-label="Console output" tabIndex={0} className="h-40 overflow-y-auto rounded-xl bg-con p-4 font-mono text-[13px] leading-6 text-con-ink">
                  {log.map((line, i) => (
                    <p key={i}>
                      <span className="text-ink3">{String(i + 1).padStart(2, '0')}</span> {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
        <p className="text-[13px] text-ink3">A look at the panel. Use the buttons to see how it responds.</p>
      </Wrap>
    </section>
  );
}
