import { useState } from 'react';
import type { Category } from '../data';
import { Nav } from '../home/Nav';
import { Hero } from '../home/Hero';
import { Ticker } from '../home/Ticker';
import { Story } from '../home/Story';
import { Catalog } from '../home/Catalog';
import { Configurator } from '../home/Configurator';
import { Platform } from '../home/Platform';
import { FinalCta, Footer, Pricing } from '../home/Rest';

export default function Home() {
  const [cat, setCat] = useState<Category>('All');
  return (
    <>
      <Nav setCat={setCat} />
      <main id="top">
        <Hero cat={cat} setCat={setCat} />
        <Ticker />
        <Story />
        <Catalog cat={cat} setCat={setCat} />
        <Configurator />
        <Platform />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
