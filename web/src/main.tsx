import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Router } from './router';
import AppRoutes from './routes';
import { SessionProvider } from './session';
import { ToastProvider } from './ui-app';
import { ErrorBoundary } from './ErrorBoundary';
import { refreshCatalog } from './site/catalog';

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
