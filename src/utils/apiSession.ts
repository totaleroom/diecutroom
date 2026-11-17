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

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getClientSessionToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers,
  });
}
