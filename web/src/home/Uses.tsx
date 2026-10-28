import { Arrow, Reveal, Wrap } from '../ui';

/**
 * What people run on the platform.
 *
 * The list is the same for everybody, and every line names a thing the
 * catalogue really holds.
 */
const USES = [
  ['Game servers', 'Minecraft, Counter-Strike and the other game eggs of the catalogue, with the ports and the storage they need.'],
  ['Discord bots', 'Keep it online around the clock, with the logs when something breaks.'],
  ['Apps and APIs', 'Dashboards, small sites and services with a start command and a log you can read.'],
  ['Databases and tools', 'Anything on a Pterodactyl egg, from a database to a self-hosted tool.'],
  ['Development', 'A cheap place to try things before they go live.'],
] as const;

export function UseCases() {
  return (
    <section aria-label="Use cases" className="py-24">
      <Wrap className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Reveal>
          <h2 className="text-[clamp(34px,4.6vw,60px)] leading-[1.02] font-semibold tracking-[-0.04em] [text-wrap:balance]">Built for real workloads.</h2>
        </Reveal>
        <ul className="grid">
          {USES.map(([title, text], i) => (
            <Reveal as="li" key={title} delay={i * 70}>
              <div className="group flex items-center justify-between gap-6 border-t border-line py-6 transition-[padding] duration-500 ease-out-expo hover:pl-3">
                <div>
                  <h3 className="text-[22px] font-semibold tracking-tight">{title}</h3>
                  <p className="mt-1 max-w-md text-[15px] text-ink2">{text}</p>
                </div>
                <span className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-ink2 transition-[background-color,color,border-color,transform] duration-500 ease-out-expo group-hover:-rotate-45 group-hover:border-acc group-hover:bg-acc group-hover:text-black">
                  <Arrow />
                </span>
              </div>
            </Reveal>
          ))}
        </ul>
      </Wrap>
    </section>
  );
}
