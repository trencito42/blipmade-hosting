import { Btn, Crumbs, Page, Wrap } from './ui';

/**
 * The page of an address that does not exist.
 *
 * It is the page the server writes as `404.html`, so it is a page of the site
 * like any other: it has the bar of the site, the footer and a way out. A
 * visitor who lands here is not lost, the page points at the two places where
 * everything else lives.
 */
export default function NotFound() {
  return (
    <Page>
      <section aria-labelledby="nf-h">
        <Wrap className="grid justify-items-start gap-6 py-20 sm:py-28">
          <Crumbs items={[['Home', '/']]} />
          <span aria-hidden="true" className="-rotate-3 rounded-[22px] px-6 py-3 font-display text-[clamp(44px,7vw,84px)] leading-none font-semibold tracking-[-0.05em] text-paper" style={{ background: '#ff8a6b' }}>404</span>
          <h1 id="nf-h" className="text-[clamp(44px,7vw,92px)] leading-[0.95] font-semibold tracking-[-0.05em]">
            This page is not here.
          </h1>
          <p className="max-w-[30em] text-[19px] text-ink-2">
            The address may have changed, or this page went offline for a coffee. Start from the home page or search the documentation.
          </p>
          <div className="flex flex-wrap gap-3">
            <Btn to="/">Home</Btn>
            <Btn to="/docs" variant="outline">
              Documentation
            </Btn>
          </div>
        </Wrap>
      </section>
    </Page>
  );
}
