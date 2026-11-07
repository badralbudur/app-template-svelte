import { env } from '$env/dynamic/public';
import { dev } from '$app/environment';
import { error, isHttpError } from '@sveltejs/kit';

const ACCESS = 'fulcra_access_token';
const REFRESH = 'fulcra_refresh_token';
const cookieOptions = {
  path: '/',
  httpOnly: true,
  secure: !dev,
  sameSite: /** @type {const} */ ('lax')
};
// A bounded, process-local grace window lets concurrent requests share rotation.
/** @typedef {{ access_token: string, refresh_token?: string, expires_in: number }} Tokens */
/** @typedef {Pick<import('@sveltejs/kit').Cookies, 'get' | 'set' | 'delete'>} CookieJar */
/** @type {Map<string, { promise: Promise<Tokens>, revoked: boolean, replacement?: string }>} */
const rotations = new Map();
const GRACE_MS = 5000;

/** @param {CookieJar} cookies */
export function clearTokens(cookies) {
  cookies.delete(ACCESS, cookieOptions);
  cookies.delete(REFRESH, cookieOptions);
}

/** @param {CookieJar} cookies @param {Tokens} tokens @param {string} [previousRefresh] */
export function storeTokens(cookies, tokens, previousRefresh) {
  const refresh = tokens.refresh_token || previousRefresh;
  if (
    !tokens.access_token ||
    !refresh ||
    !Number.isFinite(tokens.expires_in) ||
    tokens.expires_in <= 0
  ) {
    error(502, 'Identity provider did not issue a renewable session');
  }
  cookies.set(ACCESS, tokens.access_token, {
    ...cookieOptions,
    maxAge: Math.min(Math.floor(tokens.expires_in), 86400)
  });
  cookies.set(REFRESH, refresh, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 });
}

/** @param {string} refresh @returns {Promise<Tokens>} */
async function exchange(refresh) {
  let response;
  let data;
  try {
    response = await fetch(`https://${env.PUBLIC_AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: env.PUBLIC_AUTH0_CLIENT_ID,
        refresh_token: refresh
      }),
      signal: AbortSignal.timeout(10000)
    });
    data = await response.json();
  } catch {
    error(503, 'Session renewal temporarily unavailable');
  }
  if (!response.ok) {
    if (data.error === 'invalid_grant') error(401, 'Session expired');
    error(503, 'Session renewal temporarily unavailable');
  }
  return data;
}

/** @param {CookieJar} cookies */
export async function accessToken(cookies, forceRefresh = false) {
  const access = cookies.get(ACCESS);
  if (access && !forceRefresh) return access;
  const refresh = cookies.get(REFRESH);
  if (!refresh) {
    clearTokens(cookies);
    error(401, 'Not authenticated');
  }
  let entry = rotations.get(refresh);
  if (!entry) {
    entry = { promise: exchange(refresh), revoked: false };
    rotations.set(refresh, entry);
    const current = entry;
    // Keep successful results briefly, but never cache transient failures.
    entry.promise.then(
      (tokens) => {
        current.replacement = tokens.refresh_token || refresh;
        const timer = setTimeout(() => {
          if (rotations.get(refresh) === current) rotations.delete(refresh);
        }, GRACE_MS);
        timer.unref?.();
      },
      () => {
        if (rotations.get(refresh) === current) rotations.delete(refresh);
      }
    );
  }
  try {
    const tokens = await entry.promise;
    if (entry.revoked) error(401, 'Signed out');
    storeTokens(cookies, tokens, refresh);
    return tokens.access_token;
  } catch (err) {
    if (isHttpError(err, 401)) clearTokens(cookies);
    throw err;
  }
}

// Validate on the upstream server, not by cookie presence or unverified JWT claims.
// Only safe reads may be retried. Validate before sending a mutation, then send it once.
/** @param {CookieJar} cookies @param {string | URL | Request} url @param {RequestInit} [options] @returns {Promise<Response>} */
export async function authorizedFetch(cookies, url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const safe = method === 'GET' || method === 'HEAD';
  if (!safe) {
    const validation = await authorizedFetch(
      cookies,
      `https://${env.PUBLIC_AUTH0_DOMAIN}/userinfo`
    );
    if (!validation.ok) error(validation.status === 403 ? 403 : 503, 'Unable to validate session');
  }
  let token = await accessToken(cookies);
  const send = async () => {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    try {
      return await fetch(url, { ...options, headers, signal: AbortSignal.timeout(10000) });
    } catch {
      error(503, 'Upstream temporarily unavailable');
    }
  };
  let response = await send();
  if (response.status === 401 && safe) {
    token = await accessToken(cookies, true);
    response = await send();
  }
  if (response.status === 401) {
    clearTokens(cookies);
    error(401, 'Not authenticated');
  }
  if (response.status === 403) error(403, 'Access denied');
  return response;
}

/** @param {CookieJar} cookies */
export async function logout(cookies) {
  const refresh = cookies.get(REFRESH);
  clearTokens(cookies);
  if (!refresh) return true;
  let token = refresh;
  for (const cached of rotations.values()) {
    if (cached.replacement === refresh) cached.revoked = true;
  }
  const entry = rotations.get(refresh);
  if (entry) {
    entry.revoked = true;
    try {
      token = (await entry.promise).refresh_token || refresh;
    } catch {
      /* Revoke the original token when renewal failed. */
    }
  }
  try {
    const response = await fetch(`https://${env.PUBLIC_AUTH0_DOMAIN}/oauth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.PUBLIC_AUTH0_CLIENT_ID, token }),
      signal: AbortSignal.timeout(10000)
    });
    return response.ok;
  } catch {
    return false;
  }
}
