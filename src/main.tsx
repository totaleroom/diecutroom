import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AppErrorBoundary from './components/AppErrorBoundary.tsx';
import './index.css';
import { initBrandFonts } from './utils/fontLoader';

// In dev mode, clean up any stale Service Worker registrations (dev-sw.js or sw.js)
if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      regs.forEach((reg) => {
        void reg.unregister();
      });
    })
    .catch(() => {});
}

// Recover cleanly if a lazy-loaded chunk hash changed across deployments
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    try {
      const key = 'diecut_chunk_reload_at';
      const last = Number(sessionStorage.getItem(key) || '0');
      if (Date.now() - last > 8000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  });
}

void initBrandFonts();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

if (typeof window !== 'undefined') {
  (window as unknown as { __DIECUT_MOUNTED__?: boolean }).__DIECUT_MOUNTED__ = true;
}
