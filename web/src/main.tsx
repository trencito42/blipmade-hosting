import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Router } from './router';
import AppRoutes from './routes';
import { SessionProvider } from './session';
import { ToastProvider } from './ui-app';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <SessionProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </SessionProvider>
    </Router>
  </StrictMode>,
);
