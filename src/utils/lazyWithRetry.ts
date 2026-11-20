import React, { ComponentType } from 'react';

const RETRY_STORAGE_KEY = 'diecut_chunk_reload_at';

export function isChunkLoadError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
      ? error
      : '';
  const lower = msg.toLowerCase();
  return (
    lower.includes('failed to fetch dynamically imported module') ||
    lower.includes('importing a module script failed') ||
    lower.includes('error loading dynamically imported module') ||
    lower.includes('loading chunk') ||
    lower.includes('loading css chunk') ||
    lower.includes('unexpected token') && lower.includes('<')
  );
}

export async function clearBrowserCachesAndReload(throttleMs = 12000): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const last = Number(window.sessionStorage.getItem(RETRY_STORAGE_KEY) || '0');
    if (throttleMs > 0 && Date.now() - last < throttleMs) {
      return false;
    }
    window.sessionStorage.setItem(RETRY_STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage blocked in strict sandboxed iframe; still proceed once with URL guard
    if (window.location.search.includes('_dc_rec=1') && throttleMs > 0) {
      return false;
    }
  }

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    // ignore SW errors
  }

  try {
    if ('caches' in window && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    // ignore CacheStorage errors
  }

  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_dc_rec', '1');
    url.searchParams.set('_cb', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
  return true;
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await importer();
    } catch (firstErr) {
      if (isChunkLoadError(firstErr)) {
        const reloaded = await clearBrowserCachesAndReload(12000);
        if (reloaded) {
          // Suspend cleanly while browser navigates to refreshed bundle
          return new Promise<{ default: T }>(() => {});
        }
      }
      // Second attempt in-memory (transient network blip)
      return await importer();
    }
  });
}
