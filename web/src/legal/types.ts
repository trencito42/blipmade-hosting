import type { ReactNode } from 'react';

/**
 * The shape of a legal page.
 *
 * Every legal page is the same: a title, a summary and a list of sections.
 * The sections hold blocks, and a block is a paragraph, a list or a note.
 * Keeping the content in a structure instead of in markup lets every page be
 * written the same way and lets the tests read them without a browser.
 */

export interface LegalSection {
  /** The anchor of the section. It is also the id of the heading. */
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export type LegalBlock =
  | { t: 'p'; text: ReactNode }
  | { t: 'list'; items: ReactNode[] }
  | { t: 'note'; tone?: 'note' | 'warning'; text: ReactNode };

export interface LegalDocument {
  /** The route of the page. */
  to: string;
  /** The name of the page, as it is written on the page itself. */
  label: string;
  /** The short name of the page, as it is written in the footer. */
  nav: string;
  /** The one line under the title. */
  summary: string;
  /** The day the text was last changed, as YYYY-MM-DD. */
  updated: string;
  sections: LegalSection[];
}
