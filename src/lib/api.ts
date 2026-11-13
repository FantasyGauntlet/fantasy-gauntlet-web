import { auth } from './firebase';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://fantasy-gauntlet-backend-production.up.railway.app/api/v1';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'https://fantasy-gauntlet-backend-production.up.railway.app';

// ─── Token (cached) ───────────────────────────────────────────────────────────
// Deduplicate concurrent getIdToken() calls and cache the result for 55 min
// so every API request doesn't pay the async overhead of a Firebase SDK call.

let _tokenInFlight: Promise<string> | null = null;
let _cachedToken = '';
let _tokenExpiry = 0;

async function getToken(): Promise<string> {
  const now = Date.now();
  // Return cached token while still valid (refresh 5 min before expiry)
  if (_cachedToken && _tokenExpiry - now > 5 * 60_000) return _cachedToken;

  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  // Deduplicate: if a refresh is already in flight, join it
  if (!_tokenInFlight) {
    _tokenInFlight = user.getIdToken().finally(() => { _tokenInFlight = null; });
  }
  const token = await _tokenInFlight;
  _cachedToken = token;
  _tokenExpiry = now + 55 * 60_000;
  return token;
}

// ─── GET cache (stale-while-revalidate) ───────────────────────────────────────
// Fresh (< 30 s): return from cache, no network.
// Stale (30 s – 2 min): return from cache immediately, revalidate in background.
// Miss / expired: fetch and block until response arrives.

const FRESH_MS = 30_000;
const STALE_MS = 120_000;

const _cache = new Map<string, { data: unknown; ts: number }>();

function cachedGet<T>(path: string, fetchFn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = _cache.get(path);

  if (entry) {
    const age = now - entry.ts;
    if (age < FRESH_MS) return Promise.resolve(entry.data as T);
    if (age < STALE_MS) {
      // Serve stale immediately, refresh in background
      fetchFn().then(data => _cache.set(path, { data, ts: Date.now() })).catch(() => {});
      return Promise.resolve(entry.data as T);
    }
  }

  return fetchFn().then(data => {
    _cache.set(path, { data, ts: Date.now() });
    return data;
  });
}

// ─── Core request ─────────────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? res.statusText);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Request against a backend route marked @Public() — sends no Authorization
 * header and never touches Firebase auth.
 *
 * The authenticated `request` above starts by calling getToken(), which throws
 * "Not authenticated" when auth.currentUser is null. That is correct for normal
 * calls but wrong for the handful of routes that exist precisely for people who
 * are NOT signed in: password reset threw before the request was ever sent, so
 * the only users who could successfully ask for a reset link were the ones
 * already logged in and therefore least likely to need one.
 */
async function publicRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? res.statusText);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string) => cachedGet<T>(path, () => request<T>(path)),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  /** POST to a @Public() route without requiring a signed-in user. */
  postPublic: <T>(path: string, body?: unknown) =>
    publicRequest<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  // Warm the cache for a set of GET paths (fire-and-forget, used for hover prefetch)
  prefetch: (paths: string[]) => {
    for (const path of paths) {
      const entry = _cache.get(path);
      if (!entry || Date.now() - entry.ts > FRESH_MS) {
        request(path).then(data => _cache.set(path, { data, ts: Date.now() })).catch(() => {});
      }
    }
  },

  // Drop all cache entries whose path starts with the given prefix
  invalidate: (prefix: string) => {
    for (const key of _cache.keys()) {
      if (key.startsWith(prefix)) _cache.delete(key);
    }
  },
};

/** Call on sign-out to prevent the next user from seeing cached data. */
export function clearSession() {
  _cache.clear();
  _cachedToken = '';
  _tokenExpiry = 0;
  _tokenInFlight = null;
}
