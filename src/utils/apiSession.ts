const SESSION_STORAGE_KEY = 'diecut_session_token_v1';

export function getClientSessionToken(): string | null {
  try {
    const fromSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (fromSession) return fromSession;
  } catch {
    // ignore storage access error
  }
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setClientSessionToken(token: string | null | undefined): void {
  if (!token) return;
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // ignore
  }
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // ignore
  }
}

export function clearClientSessionToken(): void {
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

/**
 * Resolves relative `/api/...` or `/fonts/...` paths against `VITE_API_BASE_URL`
 * when deployed in Split Mode (e.g., Vercel frontend + Debian VPS Express/SQLite backend).
 * Defaults to same-origin relative paths when `VITE_API_BASE_URL` is unset.
 */
export function resolveApiUrl(pathOrUrl: string): string {
  if (!RAW_API_BASE) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith('/')) return `${RAW_API_BASE}${pathOrUrl}`;
  return `${RAW_API_BASE}/${pathOrUrl}`;
}

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getClientSessionToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const resolvedInput = typeof input === 'string' ? resolveApiUrl(input) : input;
  return fetch(resolvedInput, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers,
  });
}
