import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import AppErrorBoundary from './components/AppErrorBoundary.tsx';
import './index.css';
import { initBrandFonts } from './utils/fontLoader';
import { clearBrowserCachesAndReload, isChunkLoadError } from './utils/lazyWithRetry';

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

// Recover cleanly without sending logs to Admin if chunk hash changed or async module load fails
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    void clearBrowserCachesAndReload(8000);
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      void clearBrowserCachesAndReload(12000);
    }
  });
}

void initBrandFonts();

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>
  );
}
