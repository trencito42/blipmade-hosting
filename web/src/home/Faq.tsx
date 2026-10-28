import { useId, useState } from 'react';
import { cn } from '../lib';
import { FAQ } from '../data';
import { Reveal, Wrap } from '../ui';

/**
 * The questions the customers ask.
 *
 * The answers are the rules of the platform, and they come from the same
 * place the rest of the interface comes from: `src/data.ts`.
 */
export function Faq() {
  const [open, setOpen] = useState(0);
  const uid = useId();
  return (
    <section id="faq" aria-label="Questions and answers" className="py-24">
      <Wrap className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Reveal>
          <h2 className="text-[clamp(34px,4.6vw,60px)] leading-[1.02] font-semibold tracking-[-0.04em] [text-wrap:balance]">Questions, answered.</h2>
        </Reveal>
        <ul className="grid gap-2.5">
          {FAQ.map(([question, answer], i) => (
            <Reveal as="li" key={question} delay={i * 60}>
              <div className={cn('rounded-xl border bg-card transition-colors duration-300', open === i ? 'border-acc/40' : 'border-line')}>
                <h3>
                  <button
                    type="button"
                    id={`${uid}-q${i}`}
                    aria-expanded={open === i}
                    aria-controls={`${uid}-a${i}`}
                    onClick={() => setOpen(open === i ? -1 : i)}
                    className="flex min-h-14 w-full items-center justify-between gap-4 rounded-xl px-5 py-3 text-left text-[16.5px] font-medium"
                  >
                    {question}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                      className="shrink-0 text-ink2 transition-transform duration-500 ease-out-expo"
                      style={{ transform: open === i ? 'rotate(45deg)' : 'none' }}
                    >
                      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </h3>
                <div
                  id={`${uid}-a${i}`}
                  role="region"
                  aria-labelledby={`${uid}-q${i}`}
                  className={cn('grid transition-[grid-template-rows] duration-500 ease-out-expo', open === i ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-[15.5px] text-ink2">{answer}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </Wrap>
    </section>
  );
}
