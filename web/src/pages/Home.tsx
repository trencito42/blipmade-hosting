import { Nav } from '../home/Nav';
import { Hero } from '../home/Hero';
import { Plans } from '../home/Plans';
import { Why } from '../home/Why';
import { PanelPreview } from '../home/Panel';
import { UseCases } from '../home/Uses';
import { Faq } from '../home/Faq';
import { Closing, Footer } from '../home/Closing';

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <Plans />
        <Why />
        <PanelPreview />
        <UseCases />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
