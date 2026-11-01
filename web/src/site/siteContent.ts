import { useEffect, useState } from 'react';
import { eur, type Rates } from './pricing';
import type { AppCopy, Question } from './content';

/**
 * The words the operator published from the back office.
 *
 * The site is written to the disk with the words of the code, so a crawler and a reader without
 * JavaScript always see text that is right. When the page is open, the published words are read once
 * and replace the words of the code. Until they arrive, and when they cannot be read, the words of the
 * code stay. A number is never typed: a text carries a placeholder and this module fills it with the
 * rate the platform really charges.
 */

type Blocks = Record<string, any>;

let loaded: Blocks | null = null;
let pending: Promise<Blocks> | null = null;
const listeners = new Set<(blocks: Blocks) => void>();

function load(): Promise<Blocks> {
  pending ??= fetch('/api/content', { credentials: 'omit' })
    .then((response) => (response.ok ? response.json() : { content: {} }))
    .then((body: { content?: Blocks }) => body.content ?? {})
    .catch(() => ({}))
    .then((blocks) => {
      loaded = blocks;
      listeners.forEach((listener) => listener(blocks));
      return blocks;
    });
  return pending;
}

/** The published blocks. They are empty until they are read, and empty when there are none. */
export function useSiteContent(): Blocks {
  const [blocks, setBlocks] = useState<Blocks>(loaded ?? {});
  useEffect(() => {
    if (loaded) {
      setBlocks(loaded);
      return;
    }
    listeners.add(setBlocks);
    void load();
    return () => void listeners.delete(setBlocks);
  }, []);
  return blocks;
}

/** Fills the placeholders of a text with the rates of the catalogue. */
export function fillRates(text: string, rates: Rates, from?: number): string {
  return text.replace(/\{\{\s*(ramPerGb|cpuPerUnit|diskPerGb|baseFee|from)\s*\}\}/g, (_all, name: string) => {
    if (name === 'from') return from === undefined ? '' : eur(from);
    return eur((rates as unknown as Record<string, number>)[name] ?? 0);
  });
}

export function faqFromContent(blocks: Blocks, rates: Rates): Question[] | null {
  const items = blocks['home.faq']?.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  return items.map((item: { q: string; a: string }) => ({ q: fillRates(item.q, rates), a: fillRates(item.a, rates) }));
}

export function copyFromContent(blocks: Blocks, slug: string, base: AppCopy | undefined, fallback: AppCopy): AppCopy {
  const changed = blocks['product.copy']?.[slug];
  const start = base ?? fallback;
  if (!changed) return start;
  return { ...start, tagline: changed.tagline, lead: changed.lead, fits: changed.fits ?? start.fits, note: changed.note ?? start.note };
}
