import { useEffect } from 'react';
import { metaFor } from './seo';
import { applyMeta } from './head';
import { useSiteContent } from './siteContent';

/**
 * The head of a page of the public site.
 *
 * The page that is written to the disk carries its own head: the title, the
 * description, the address of the page and the structured data. The browser
 * keeps them right when the visitor moves to another page without a load.
 *
 * This module is loaded when it is needed and not with the rest of the site:
 * the meta of a page of the documentation names the page, and the text of the
 * documentation is a large file that a visitor of the home page does not need.
 */
export function Head({ path }: { path: string }) {
  const changed = useSiteContent()['seo.pages']?.[path] as { title: string; description: string } | undefined;
  useEffect(() => {
    const meta = metaFor(path);
    // The title and the description the operator published replace the ones of the code, for this page only.
    applyMeta(changed ? { ...meta, title: changed.title, description: changed.description } : meta);
  }, [path, changed]);
  return null;
}
