import { type ReactNode } from 'react';
import { cn } from '../lib';
import { Reveal, Wrap } from '../ui';

/**
 * What the platform does for the customer.
 *
 * Six cells. Every cell carries something the customer can look at: a bar
 * that fills, the three buttons of the panel, the bars of a disk, a light
 * that is on, a conversation. None of them is a number the platform invented.
 */

function Cell({ title, text, className, delay, children }: { title: string; text: string; className?: string; delay: number; children?: ReactNode }) {
  return (
    <Reveal delay={delay} className={className}>
      <div className="group grid h-full min-h-[220px] content-between gap-8 rounded-2xl border border-line bg-card p-6 transition-[border-color,background-color] duration-300 hover:border-acc/50 hover:bg-s2">
        <div aria-hidden="true">{children}</div>
        <div>
          <h3 className="text-[20px] font-semibold tracking-tight">{title}</h3>
          <p className="mt-1.5 max-w-sm text-[15px] text-ink2">{text}</p>
        </div>
      </div>
    </Reveal>
  );
}

export function Why() {
  const bars = [34, 52, 41, 66, 48, 72, 44, 60];
  return (
    <section id="why" aria-label="Why Blipmade" className="py-24">
      <Wrap className="grid gap-12">
        <Reveal>
          <h2 className="max-w-3xl text-[clamp(34px,4.6vw,60px)] leading-[1.02] font-semibold tracking-[-0.04em] [text-wrap:balance]">
            No bloat. No nonsense. Just reliable hosting.
          </h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-6">
          <Cell delay={0} className="md:col-span-3" title="Launch in seconds" text="Pick a product, choose its resources, and the server starts.">
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full w-full origin-left rounded-full bg-acc transition-transform duration-[1400ms] ease-out-expo [transform:scaleX(.35)] group-hover:[transform:scaleX(1)]" />
            </div>
          </Cell>
          <Cell delay={80} className="md:col-span-3" title="A panel that stays out of the way" text="Console, files and startup settings. Nothing you have to hunt for.">
            <div className="flex gap-2">
              {['Start', 'Restart', 'Stop'].map((label, i) => (
                <span key={label} className={cn('rounded-lg border px-3 py-1.5 text-[13px] font-medium', i === 0 ? 'border-acc/50 bg-acc/10 text-acc-h' : 'border-line text-ink2')}>
                  {label}
                </span>
              ))}
            </div>
          </Cell>
          <Cell delay={0} className="md:col-span-2" title="SSD storage" text="Fast disks on every product.">
            <div className="flex h-10 items-end gap-1">
              {bars.map((height, i) => (
                <span key={i} className="w-full rounded-sm bg-line transition-colors group-hover:bg-acc" style={{ height: `${height}%`, transitionDelay: `${i * 30}ms` }} />
              ))}
            </div>
          </Cell>
          <Cell delay={80} className="md:col-span-2" title="One account for everything" text="Servers, domains, mail and invoices in the same place.">
            <div className="grid gap-1.5 text-[13px]">
              <span className="w-fit rounded-xl rounded-bl-sm bg-line px-3 py-1.5">web</span>
              <span className="w-fit rounded-xl rounded-bl-sm bg-line px-3 py-1.5">game</span>
              <span className="w-fit rounded-xl rounded-bl-sm bg-line px-3 py-1.5">mail</span>
            </div>
          </Cell>
          <Cell delay={160} className="md:col-span-2" title="Direct support" text="A ticket reaches the people who run the platform.">
            <div className="grid gap-1.5 text-[13px]">
              <span className="w-fit rounded-xl rounded-bl-sm bg-line px-3 py-1.5">My bot keeps restarting</span>
              <span className="ml-auto w-fit rounded-xl rounded-br-sm bg-acc/15 px-3 py-1.5 text-acc-h">Looking at it now</span>
            </div>
          </Cell>
        </div>
      </Wrap>
    </section>
  );
}
