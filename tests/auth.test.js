import { afterEach, beforeEach, expect, it, vi } from 'vitest';
/** @type {typeof import('@testing-library/svelte').cleanup} */
let cleanup;
/** @type {typeof import('@testing-library/svelte').render} */
let render;
/** @type {typeof import('@testing-library/svelte').screen} */
let screen;
/** @type {typeof import('@testing-library/svelte').waitFor} */
let waitFor;

vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/') } }));
vi.mock('svelte/transition', () => ({ blur: () => ({ duration: 0 }) }));
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$env/dynamic/public', () => ({
  env: {
    PUBLIC_AUTH0_DOMAIN: 'auth.example',
    PUBLIC_AUTH0_CLIENT_ID: 'test',
    PUBLIC_FULCRA_API_ENDPOINT: 'https://api.example'
  }
}));

/** @param {unknown} data */
const response = (data, ok = true) => ({ ok, json: async () => data });
const profile = { 'fulcradynamics.com/userid': 'restored' };
const device = {
  device_code: 'device',
  user_code: 'ABCD',
  verification_uri_complete: 'https://auth.example/verify',
  interval: 1
};
function deferred() {
  /** @type {(value: unknown) => void} */
  let resolve = () => {};
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  vi.resetModules();
  ({ cleanup, render, screen, waitFor } = await import('@testing-library/svelte'));
  const storage = new Map();
  vi.stubGlobal('localStorage', {
    /** @param {string} key */
    getItem: (key) => storage.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => storage.set(key, String(value)),
    /** @param {string} key */
    removeItem: (key) => storage.delete(key)
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each([null, JSON.stringify({ auth0UserInfo: profile, fulcraUserInfo: {} })])(
  'withholds children and login until the entire server restoration finishes (cached: %s)',
  async (cached) => {
    if (cached) localStorage.setItem('fulcraUserState', cached);
    const check = deferred();
    const info = deferred();
    const fetcher = vi.fn((url) => {
      if (url === '/api/auth/user') return check.promise;
      if (url === '/api/user/info') return info.promise;
      throw new Error(`Unexpected ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const { default: Layout } = await import('./LayoutHarness.svelte');
    const mounted = vi.fn();
    render(Layout, { mounted });
    expect(screen.queryByText('Private feature')).toBeNull();
    expect(mounted).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Sign In' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create Account' })).toBeNull();
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/auth/user'));
    check.resolve(response(profile));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/api/user/info',
        expect.objectContaining({ method: 'POST' })
      )
    );
    expect(mounted).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Sign In' })).toBeNull();
    info.resolve(response({}));
    await screen.findByText('Private feature');
    expect(mounted).toHaveBeenCalledTimes(1);
  }
);

it.each(['stale', 'malformed', 'invalid-shape', 'network', 'profile'])(
  'never trusts cached profiles during %s restoration',
  async (kind) => {
    localStorage.setItem(
      'fulcraUserState',
      kind === 'malformed' ? '{invalid' : JSON.stringify({ auth0UserInfo: profile })
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (kind === 'network') throw new Error('offline');
        return { ...response({}, false), status: kind === 'profile' ? 503 : 401 };
      })
    );
    const { default: Layout } = await import('./LayoutHarness.svelte');
    const mounted = vi.fn();
    render(Layout, { mounted });
    if (['network', 'profile'].includes(kind)) await screen.findByRole('alert');
    else await screen.findByRole('button', { name: 'Sign In' });
    expect(mounted).not.toHaveBeenCalled();
    expect(localStorage.getItem('fulcraUserState')).toBeNull();
  }
);

it('deduplicates initialization and ignores storage failures', async () => {
  const info = deferred();
  vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
    throw new Error('Unavailable');
  });
  const fetcher = vi.fn(() => info.promise);
  vi.stubGlobal('fetch', fetcher);
  const { user } = await import('../src/lib/user.js');
  const first = user.init();
  expect(user.init()).toBe(first);
  info.resolve({ ...response({}, false), status: 401 });
  await first;
  const { get } = await import('svelte/store');
  expect(get(user).status).toBe('signed-out');
  expect(fetcher).toHaveBeenCalledOnce();
});

it('does not let stale initialization reauthenticate after logout', async () => {
  const info = deferred();
  vi.spyOn(window, 'open').mockReturnValue(null);
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => (url === '/api/auth/user' ? info.promise : Promise.resolve(response({}))))
  );
  const { user } = await import('../src/lib/user.js');
  const { get } = await import('svelte/store');
  const init = user.init();
  const logout = user.logout();
  expect(get(user).status).toBe('signing-out');
  info.resolve(response(profile));
  await Promise.all([init, logout]);
  expect(get(user).status).toBe('signed-out');
  expect(get(user).auth0UserInfo).toEqual({});
});

it('keeps the default document title while logged out without mounting feature children', async () => {
  document.title = '';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ...response({}, false), status: 401 }))
  );
  const { default: Layout } = await import('./LayoutHarness.svelte');
  const mounted = vi.fn();
  render(Layout, { mounted });
  await screen.findByRole('button', { name: 'Sign In' });
  expect(mounted).not.toHaveBeenCalled();
  expect(screen.queryByText('Private feature')).toBeNull();
  expect(document.title).toBe('Fulcra App Template');
});

it('hides all template placeholders when slots are disabled without a logo', async () => {
  const { default: Login } = await import('../src/lib/components/LoginDeviceFlow.svelte');
  render(Login, { showSlots: false, logoSrc: '' });
  expect(screen.queryByText('your logo')).toBeNull();
  expect(screen.queryByText('app_name')).toBeNull();
  expect(screen.queryByText(/Template slots on this screen/)).toBeNull();
  expect(screen.getByRole('img', { name: 'Fulcra' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Create Account' })).toBeTruthy();
});

it('accepts custom branding and an optional logo without changing login', async () => {
  const { default: Login } = await import('../src/lib/components/LoginDeviceFlow.svelte');
  render(Login, {
    appName: 'Custom app',
    tagline: 'Custom tagline',
    description: 'Custom description',
    showSlots: false,
    logoSrc: '/custom.svg'
  });
  expect(screen.getByRole('heading', { name: 'Custom app' })).toBeTruthy();
  expect(screen.getByText('Custom tagline')).toBeTruthy();
  expect(screen.getByText('Custom description')).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Custom app' }).getAttribute('src')).toBe('/custom.svg');
  expect(screen.queryByText('app_name')).toBeNull();
  expect(screen.queryByText('your logo')).toBeNull();
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
});

it('does not mount children after being unmounted during restoration', async () => {
  const check = deferred();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      if (url === '/api/auth/user') return check.promise;
      return response(url === '/api/auth/user' ? profile : {});
    })
  );
  const { default: Layout } = await import('./LayoutHarness.svelte');
  const mounted = vi.fn();
  const view = render(Layout, { mounted });
  view.unmount();
  check.resolve(response(profile));
  const { user } = await import('../src/lib/user.js');
  const { get } = await import('svelte/store');
  await waitFor(() => expect(get(user).init).toBe(true));
  expect(mounted).not.toHaveBeenCalled();
  expect(screen.queryByText('Private feature')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sign In' })).toBeNull();
});

it('shows polling failures in the real login UI without mounting feature children', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      if (url === '/api/auth/user') return { ...response({}, false), status: 401 };
      if (url === '/api/auth/device/code') return response(device);
      return response({
        status: 400,
        data: { error: 'access_denied', error_description: 'Denied' }
      });
    })
  );
  vi.spyOn(window, 'open').mockReturnValue(null);
  const { default: Layout } = await import('./LayoutHarness.svelte');
  const mounted = vi.fn();
  render(Layout, { mounted });
  const button = await screen.findByRole('button', { name: 'Sign In' });
  vi.useFakeTimers();
  button.click();
  await vi.advanceTimersByTimeAsync(1000);
  expect(screen.getByText('Denied')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
  expect(mounted).not.toHaveBeenCalled();
});

it('uses the default app config when branding is omitted', async () => {
  const { appConfig } = await import('../src/lib/app-config.js');
  const { default: Login } = await import('../src/lib/components/LoginDeviceFlow.svelte');
  render(Login);
  expect(screen.getByRole('heading', { name: appConfig.appName })).toBeTruthy();
  expect(screen.getByText(appConfig.tagline)).toBeTruthy();
  expect(screen.getByText(appConfig.description)).toBeTruthy();
  expect(screen.getByText('your logo')).toBeTruthy();
  expect(screen.getByText('app_name')).toBeTruthy();
});

it.each([false, true])(
  'opens login synchronously, supports blocked popup (%s), completes login and signs out',
  async (blocked) => {
    const code = deferred();
    const revoke = deferred();
    const popup = { closed: false, location: { href: '' }, close: vi.fn() };
    const logoutPopup = { closed: false, close: vi.fn() };
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValueOnce(blocked ? null : /** @type {Window} */ (/** @type {unknown} */ (popup)))
      .mockReturnValueOnce(
        blocked ? null : /** @type {Window} */ (/** @type {unknown} */ (logoutPopup))
      );
    let loggedIn = false;
    const fetcher = vi.fn(async (url, options) => {
      if (url === '/api/auth/user')
        return loggedIn ? response(profile) : { ...response({}, false), status: 401 };
      if (url === '/api/auth/device/code') return code.promise;
      if (url === '/api/auth/device/token') {
        loggedIn = true;
        return response({
          status: 200,
          data: {}
        });
      }
      if (url === '/api/auth/token') return response({});
      if (url === '/api/auth/user') return response(profile);
      if (url === '/api/user/info') return response({});
      if (url === '/api/auth/revoke') return revoke.promise;
      throw new Error(`Unexpected ${url} ${options?.method}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const { default: Layout } = await import('./LayoutHarness.svelte');
    const { user } = await import('../src/lib/user.js');
    render(Layout, { mounted: vi.fn() });
    const button = await screen.findByRole('button', { name: 'Sign In' });
    vi.useFakeTimers();
    button.click();
    // These assertions run in the click's call stack, before yielding to any promise.
    expect(open).toHaveBeenCalledWith(
      'about:blank',
      'auth0-device-flow',
      'width=500,height=700,left=100,top=100'
    );
    expect(open.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[1]);
    if (!blocked) expect(popup.location.href).toBe('https://auth.example/v2/logout');
    code.resolve(response(device));
    await vi.advanceTimersByTimeAsync(blocked ? 0 : 1200);
    expect(screen.getByText('ABCD')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Open the verification page' }).getAttribute('href')
    ).toBe(device.verification_uri_complete);
    if (!blocked) expect(popup.location.href).toBe(device.verification_uri_complete);
    await vi.advanceTimersByTimeAsync(1000);
    expect(screen.getByText('Private feature')).toBeTruthy();
    expect(fetcher.mock.calls.some(([url]) => url === '/api/auth/token')).toBe(false);
    if (!blocked) expect(popup.close).toHaveBeenCalledOnce();
    const logout = user.logout();
    expect(open).toHaveBeenLastCalledWith(
      'https://auth.example/v2/logout',
      'auth0-logout',
      'width=500,height=600,left=100,top=100'
    );
    await vi.advanceTimersByTimeAsync(0);
    const revokeIndex = fetcher.mock.calls.findIndex(([url]) => url === '/api/auth/revoke');
    expect(open.mock.invocationCallOrder[1]).toBeLessThan(
      fetcher.mock.invocationCallOrder[revokeIndex]
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledWith('/api/auth/revoke', { method: 'POST' });
    revoke.resolve(response({}));
    await logout;
    await vi.advanceTimersByTimeAsync(1500);
    expect(localStorage.getItem('fulcraUserState')).toBeNull();
    expect(screen.queryByText('Private feature')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
    if (!blocked) expect(logoutPopup.close).toHaveBeenCalledOnce();
  }
);

it('shows device-flow errors and closes the popup', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) =>
      url === '/api/auth/user' ? { ...response({}, false), status: 401 } : response({}, false)
    )
  );
  const { user } = await import('../src/lib/user.js');
  await user.init();
  const popup = { closed: false, location: { href: '' }, close: vi.fn() };
  vi.spyOn(window, 'open').mockReturnValue(/** @type {Window} */ (/** @type {unknown} */ (popup)));
  const { default: Login } = await import('../src/lib/components/LoginDeviceFlow.svelte');
  render(Login);
  screen.getByRole('button', { name: 'Create Account' }).click();
  await screen.findByText('Failed to start device flow');
  expect(popup.close).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
});

it('polls pending and slow_down without receiving tokens', async () => {
  vi.useFakeTimers();
  const { Auth0DeviceFlow } = await import('../src/lib/auth0-device-flow.js');
  const auth = new Auth0DeviceFlow();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ status: 400, data: { error: 'authorization_pending' } }))
    .mockResolvedValueOnce(response({ status: 400, data: { error: 'slow_down' } }))
    .mockResolvedValueOnce(response({ status: 200, data: {} }));
  vi.stubGlobal('fetch', fetcher);
  const poll = auth.pollForToken('device', 1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(5999);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  await expect(poll).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenLastCalledWith(
    '/api/auth/device/token',
    expect.objectContaining({ body: JSON.stringify({ deviceCode: 'device' }) })
  );
});

it.each(['denied', 'http', 'network'])('stops polling on %s errors', async (kind) => {
  vi.useFakeTimers();
  const { Auth0DeviceFlow } = await import('../src/lib/auth0-device-flow.js');
  const auth = new Auth0DeviceFlow();
  const fetcher = vi.fn(async () => {
    if (kind === 'network') throw new Error('offline');
    return response(
      { status: 400, data: { error: 'access_denied', error_description: 'Denied' } },
      kind !== 'http'
    );
  });
  vi.stubGlobal('fetch', fetcher);
  const assertion = expect(auth.pollForToken('device', 1)).rejects.toThrow(
    kind === 'denied' ? 'Denied' : kind === 'http' ? 'Failed to poll for token' : 'offline'
  );
  await vi.advanceTimersByTimeAsync(1000);
  await assertion;
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetcher).toHaveBeenCalledOnce();
  expect('tokenData' in auth).toBe(false);
});

it('waits for an in-flight login response before logout and cannot publish its profile', async () => {
  vi.useFakeTimers();
  vi.spyOn(window, 'open').mockReturnValue(null);
  const token = deferred();
  const fetcher = vi.fn(async (url) => {
    if (url === '/api/auth/device/code') return response(device);
    if (url === '/api/auth/device/token') return token.promise;
    if (url === '/api/auth/revoke') return response({ revoked: true });
    throw new Error(`Unexpected ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  const { user } = await import('../src/lib/user.js');
  const { get } = await import('svelte/store');
  await user.startLogin(null);
  const login = user.completeLogin('device', 1);
  const rejected = expect(login).rejects.toThrow('Login cancelled');
  await vi.advanceTimersByTimeAsync(1000);
  const logout = user.logout();
  expect(fetcher.mock.calls.some(([url]) => url === '/api/auth/revoke')).toBe(false);
  token.resolve(response({ status: 200 }));
  await rejected;
  await logout;
  expect(fetcher).toHaveBeenLastCalledWith('/api/auth/revoke', { method: 'POST' });
  expect(get(user).status).toBe('signed-out');
  expect(get(user).auth0UserInfo).toEqual({});
});

it('reports server logout failure without restoring local authentication', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('offline');
    })
  );
  const { user } = await import('../src/lib/user.js');
  const { get } = await import('svelte/store');
  await user.logout();
  expect(get(user).status).toBe('error');
  expect(get(user).authenticated).toBe(false);
  expect(get(user).message).toContain('retry sign out');
});

it('invalidates the shared session when a feature request is unauthorized', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ...response({}, false), status: 401 }))
  );
  const { user } = await import('../src/lib/user.js');
  const { get } = await import('svelte/store');
  await user.request('/api/user/preferences');
  expect(get(user).status).toBe('signed-out');
});

it.each([401, 503])('classifies profile %s after device login like restoration', async (status) => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      if (url === '/api/auth/device/code') return response(device);
      if (url === '/api/auth/device/token') return response({ status: 200 });
      return { ...response({}, false), status };
    })
  );
  const { user } = await import('../src/lib/user.js');
  const { get } = await import('svelte/store');
  await user.startLogin(null);
  const rejected = expect(user.completeLogin('device', 1)).rejects.toMatchObject({ status });
  await vi.advanceTimersByTimeAsync(1000);
  await rejected;
  expect(get(user).status).toBe(status === 401 ? 'signed-out' : 'error');
  expect(get(user).auth0UserInfo).toEqual({});
});

it.each(['pending', 'revoke', 'revoke-body'])(
  'bounds %s waits, keeps old work tracked and offers visible sign-out recovery',
  async (kind) => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const stuck = deferred();
    let revokes = 0;
    const fetcher = vi.fn(async (url) => {
      if (url === '/api/auth/user') return response(profile);
      if (url === '/api/user/info') return response({});
      if (url === '/api/user/preferences') return stuck.promise;
      if (url === '/api/auth/revoke') {
        revokes++;
        if (revokes === 1 && kind === 'revoke') return stuck.promise;
        if (revokes === 1 && kind === 'revoke-body') return { ok: true, json: () => stuck.promise };
        return response({ revoked: true });
      }
      throw new Error(`Unexpected ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const { user } = await import('../src/lib/user.js');
    const { get } = await import('svelte/store');
    const { default: Layout } = await import('./LayoutHarness.svelte');
    render(Layout, { mounted: vi.fn() });
    await screen.findByText('Private feature');
    vi.useFakeTimers();
    if (kind === 'pending') void user.request('/api/user/preferences');
    const logout = user.logout();
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByRole('status').textContent).toContain('Signing out');
    expect(screen.queryByText('Private feature')).toBeNull();
    expect(get(user).auth0UserInfo).toEqual({});
    await vi.advanceTimersByTimeAsync(10000);
    await logout;
    expect(screen.getByRole('alert').textContent).toMatch(/Unable to confirm sign-out/);
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign In' })).toBeNull();
    await expect(user.startLogin(null)).rejects.toThrow(/Sign-out/);
    await expect(user.request('/api/user/preferences')).rejects.toThrow(/Sign-out/);
    const expectedRevokes = kind === 'pending' ? 0 : 1;
    expect(revokes).toBe(expectedRevokes);
    // Retrying while the request never settles must time out without another revoke.
    screen.getByRole('button', { name: 'Sign Out' }).click();
    await vi.advanceTimersByTimeAsync(10000);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(revokes).toBe(expectedRevokes);
    stuck.resolve(kind === 'revoke-body' ? { revoked: true } : response({ revoked: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(get(user).status).toBe('error');
    expect(screen.queryByText('Private feature')).toBeNull();
    screen.getByRole('button', { name: 'Sign Out' }).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(revokes).toBe(expectedRevokes + 1);
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
  }
);
