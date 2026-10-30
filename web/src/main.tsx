import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Router } from './router';
import AppRoutes from './routes';
import { SessionProvider } from './session';
import { ToastProvider } from './ui-app';
import { ErrorBoundary } from './ErrorBoundary';
import { refreshCatalog } from './site/catalog';
import { initMonitoring } from './lib/monitoring';

// A deploy replaces the files of the site, so a tab that was open before it asks for a file that
// no longer exists. The page is loaded again once, to pick up the new files. The guard keeps a
// real outage from turning into a loop of reloads.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('bm-reloaded-at') ?? 0);
    if (Date.now() - last < 15000) return;
    sessionStorage.setItem('bm-reloaded-at', String(Date.now()));
  } catch {
    /* without storage the page is loaded again once per error, which is what is wanted */
  }
  event.preventDefault();
  window.location.reload();
});

initMonitoring();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      {/* The boundary is above the pages of the site, so a render error in
          any of them shows a page that can be read instead of a blank
          screen. It is inside the router, so the links of the page that is
          shown still work. */}
      <ErrorBoundary>
        <SessionProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </SessionProvider>
      </ErrorBoundary>
    </Router>
  </StrictMode>,
);

// The catalog of the platform is read once, after the page is drawn. The page
// starts from the snapshot that the build wrote, so a visitor sees the
// products and their prices at once, and the live catalog replaces the
// snapshot when the API answers.
refreshCatalog();
