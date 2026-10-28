import { renderToString } from 'react-dom/server';
import { Router, setServerLocation } from '../router';
import { Page } from './ui';
import Home from './Home';
import { Apps, AppDetail } from './Apps';
import { DocsArticle, DocsIndex } from './Docs';
import { AuthForgot, AuthLogin, AuthRegister, AuthReset, AuthVerify } from './Auth';
import { LegalPage } from './Legal';
import NotFound from './NotFound';
import { matchPublic } from './public-routes';
import { allRoutes, metaFor } from './seo';
import { headHtml } from './head';

/**
 * The page of the site, written to the disk.
 *
 * The site is written before it is served: every address of the public site
 * becomes a file with the page already in it, so a reader without JavaScript
 * and a crawler read the same thing a browser reads.
 *
 * The pages of the public site are the only ones that are written. The
 * dashboard needs a session and the answer of the API, so it is drawn by the
 * browser alone.
 */

/** The page of an address, with the frame of the site around it. */
function PublicPage({ path }: { path: string }) {
  const match = matchPublic(path);
  switch (match.kind) {
    case 'home':
      return (
        <Page>
          <Home />
        </Page>
      );
    case 'apps':
      return (
        <Page>
          <Apps />
        </Page>
      );
    case 'app':
      return (
        <Page>
          <AppDetail slug={match.param ?? ''} />
        </Page>
      );
    case 'docs':
      return (
        <Page>
          <DocsIndex />
        </Page>
      );
    case 'doc':
      return (
        <Page>
          <DocsArticle id={match.param ?? ''} />
        </Page>
      );
    case 'legal':
      return (
        <Page>
          <LegalPage slug={match.param ?? ''} />
        </Page>
      );
    // The five screens of the account carry their own frame: they are a full
    // page of their own, with the panel of the platform on the side.
    case 'login':
      return <AuthLogin />;
    case 'register':
      return <AuthRegister />;
    case 'forgot':
      return <AuthForgot />;
    case 'reset':
      return <AuthReset />;
    case 'verify':
      return <AuthVerify />;
    default:
      return <NotFound />;
  }
}

/**
 * The page of an address, and the head that belongs to it.
 *
 * The address is given to the router before the page is drawn, so a page that
 * reads the address of the visitor reads the one that is written.
 */
export function render(path: string, search = '') {
  setServerLocation(path, search);
  const html = renderToString(
    <Router>
      <PublicPage path={path} />
    </Router>,
  );
  const meta = metaFor(path);
  return { html, head: headHtml(meta), noindex: meta.noindex };
}

export { allRoutes, metaFor };
