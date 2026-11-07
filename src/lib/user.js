import { env } from '$env/dynamic/public';
import { writable } from 'svelte/store';
import { Auth0DeviceFlow } from '$lib/auth0-device-flow.js';
import { browser } from '$app/environment';

// Browser-only in-memory state. Never populate this singleton from server loads.
export const user = (() => {
  /** @param {'restoring' | 'authenticated' | 'signed-out' | 'signing-out' | 'error'} status */
  const empty = (status, message = '') => ({
    status,
    message,
    init: status !== 'restoring',
    authenticated: status === 'authenticated',
    auth0UserInfo: /** @type {Record<string, unknown>} */ ({}),
    fulcraUserInfo: /** @type {Record<string, unknown>} */ ({})
  });
  const { subscribe, set } = writable(empty('restoring'));
  const auth = new Auth0DeviceFlow();
  let generation = 0;
  /** @type {Promise<void> | undefined} */
  let initialized;
  /** @type {Promise<void> | undefined} */
  let loggingOut;
  // Survives a timed-out attempt: old requests may still produce Set-Cookie.
  let signOutRequired = false;
  /** @template T @param {Promise<T>} operation @returns {Promise<T>} */
  async function bounded(operation) {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    try {
      return await Promise.race([
        operation,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Sign-out timed out')), 10000);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  /** @type {Map<string, number>} */
  const loginAttempts = new Map();
  let loginAbort = new AbortController();
  const pending = new Set();
  /** @template T @param {Promise<T>} promise @returns {Promise<T>} */
  const track = (promise) => {
    pending.add(promise);
    promise.then(
      () => pending.delete(promise),
      () => pending.delete(promise)
    );
    return promise;
  };
  const removeLegacyProfile = () => {
    try {
      localStorage.removeItem('fulcraUserState');
    } catch {
      /* Storage is optional. */
    }
  };
  /** @param {number} version */
  const current = (version) => version === generation && !signOutRequired;
  /** @param {number} version */
  const requireCurrent = (version) => {
    if (!current(version)) throw new Error('Login cancelled');
  };

  /** @param {number} version */
  async function profiles(version) {
    const profile = await fetch('/api/auth/user');
    requireCurrent(version);
    if (!profile.ok)
      throw Object.assign(
        new Error('Unable to restore your session. Please reload the page to try again.'),
        { status: profile.status }
      );
    const auth0UserInfo = await profile.json();
    requireCurrent(version);
    const info = await fetch('/api/user/info', { method: 'POST' });
    requireCurrent(version);
    if (!info.ok)
      throw Object.assign(new Error('Unable to load your account. Please reload to try again.'), {
        status: info.status
      });
    const fulcraUserInfo = await info.json();
    requireCurrent(version);
    set({ ...empty('authenticated'), auth0UserInfo, fulcraUserInfo });
  }

  function init() {
    if (!browser) return Promise.resolve();
    if (initialized) return initialized;
    removeLegacyProfile();
    const version = generation;
    initialized = track(
      profiles(version).catch((err) => {
        if (current(version))
          set(
            empty(
              err.status === 401 ? 'signed-out' : 'error',
              err.status === 401
                ? ''
                : 'Unable to restore your session. Please reload the page to try again.'
            )
          );
      })
    );
    return initialized;
  }

  /** @param {Window | null} popup */
  function startLogin(popup) {
    if (signOutRequired) return Promise.reject(new Error('Sign-out is still in progress'));
    const version = ++generation;
    loginAttempts.clear();
    loginAbort.abort();
    loginAbort = new AbortController();
    return track(
      (async () => {
        const started = Date.now();
        if (popup && !popup.closed)
          popup.location.href = `https://${env.PUBLIC_AUTH0_DOMAIN}/v2/logout`;
        const info = await auth.startDeviceFlow();
        requireCurrent(version);
        if (popup && !popup.closed) {
          const remaining = 1200 - (Date.now() - started);
          if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
          requireCurrent(version);
          if (!popup.closed) popup.location.href = info.verificationUri;
        }
        loginAttempts.set(info.deviceCode, version);
        return info;
      })()
    );
  }

  /** @param {string} deviceCode @param {number} interval */
  function completeLogin(deviceCode, interval) {
    const version = loginAttempts.get(deviceCode) ?? -1;
    return track(
      (async () => {
        requireCurrent(version);
        await auth.pollForToken(deviceCode, interval, () => current(version), loginAbort.signal);
        requireCurrent(version);
        try {
          await profiles(version);
        } catch (err) {
          const unauthorized = err instanceof Error && 'status' in err && err.status === 401;
          if (current(version))
            set(
              empty(
                unauthorized ? 'signed-out' : 'error',
                unauthorized
                  ? ''
                  : 'Unable to load your session. Please reload or sign out to try again.'
              )
            );
          throw err;
        } finally {
          loginAttempts.delete(deviceCode);
        }
      })()
    );
  }

  function logout() {
    // Must stay synchronous within the click gesture; SSO clearing is best effort.
    if (loggingOut) return loggingOut;
    let popup;
    try {
      if (browser)
        popup = window.open(
          `https://${env.PUBLIC_AUTH0_DOMAIN}/v2/logout`,
          'auth0-logout',
          'width=500,height=600,left=100,top=100'
        );
    } catch {
      /* Popup blocked. */
    }
    if (popup)
      setTimeout(() => {
        if (!popup.closed) popup.close();
      }, 1500);
    ++generation;
    loginAbort.abort();
    loginAttempts.clear();
    signOutRequired = true;
    set(empty('signing-out'));
    removeLegacyProfile();
    // Let in-flight Set-Cookie responses settle BEFORE clearing server cookies.
    // Generation checks stop workflows before they can issue another request.
    loggingOut = (async () => {
      try {
        await bounded(Promise.allSettled([...pending]));
        // Bound the UI wait, not the operation. Keep even a timed-out revoke
        // tracked so it cannot later clear cookies belonging to a new login.
        const result = await bounded(
          track(
            (async () => {
              const response = await fetch('/api/auth/revoke', { method: 'POST' });
              if (!response.ok) throw new Error('Sign-out failed');
              return await response.json();
            })()
          )
        );
        if (result.revoked === false)
          set(
            empty(
              'error',
              'Signed out locally, but token revocation failed. The provider session may remain active.'
            )
          );
        else {
          signOutRequired = false;
          set(empty('signed-out'));
        }
      } catch {
        set(
          empty(
            'error',
            'Unable to confirm sign-out. Requests may still be running and the server session may remain active. Please retry sign out before reloading.'
          )
        );
      } finally {
        loggingOut = undefined;
      }
    })();
    return loggingOut;
  }

  // Feature requests share session invalidation and logout ordering, not cached proof.
  /** @param {string} url @param {RequestInit} [options] */
  function request(url, options) {
    if (signOutRequired) return Promise.reject(new Error('Sign-out is in progress'));
    const version = generation;
    return track(
      (async () => {
        const response = await fetch(url, options);
        if (current(version) && response.status === 401) set(empty('signed-out'));
        return response;
      })()
    );
  }
  return { subscribe, init, startLogin, completeLogin, logout, request };
})();
