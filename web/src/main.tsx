import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Router, useRouter } from './router';
import Home from './pages/Home';
import Login from './pages/Login';

function Routes() {
  const { path } = useRouter();
  return path.replace(/\/$/, '') === '/login' ? <Login /> : <Home />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router><Routes /></Router>
  </StrictMode>,
);
