import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('$env/dynamic/public', () => ({
  env: { PUBLIC_AUTH0_DOMAIN: 'auth.example', PUBLIC_AUTH0_CLIENT_ID: 'test' }
}));
vi.mock('$app/environment', () => ({ dev: false }));
/** @type {typeof import('./session.js')} */
let session;
/** @param {unknown} data */
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status });
/** @param {Record<string, string>} [values] */
function cookies(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    get: (/** @type {string} */ key) => data.get(key),
    set: vi.fn((key, value) => data.set(key, value)),
    delete: vi.fn((key) => data.delete(key))
  };
}
beforeEach(async () => {
  vi.resetModules();
  session = await import('./session.js');
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it('stores both tokens with deliberate secure HTTP-only lifetimes', () => {
  const jar = cookies();
  session.storeTokens(jar, { access_token: 'access', refresh_token: 'refresh', expires_in: 120 });
  expect(jar.set).toHaveBeenCalledWith(
    'fulcra_access_token',
    'access',
    expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', maxAge: 120 })
  );
  expect(jar.set).toHaveBeenCalledWith(
    'fulcra_refresh_token',
    'refresh',
    expect.objectContaining({ httpOnly: true, maxAge: 2592000 })
  );
});
it('coalesces refresh and replaces rotated cookies for every concurrent caller', async () => {
  const fetcher = vi.fn(async () =>
    reply({ access_token: 'new', refresh_token: 'rotated', expires_in: 60 })
  );
  vi.stubGlobal('fetch', fetcher);
  const a = cookies({ fulcra_refresh_token: 'old' });
  const b = cookies({ fulcra_refresh_token: 'old' });
  expect(await Promise.all([session.accessToken(a), session.accessToken(b)])).toEqual([
    'new',
    'new'
  ]);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(b.get('fulcra_refresh_token')).toBe('rotated');
});
it.each([
  ['invalid_grant', 401, true],
  ['temporarily_unavailable', 503, false]
])('handles %s without confusing failure with sign-out', async (code, status, cleared) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply({ error: code }, 400))
  );
  const jar = cookies({ fulcra_refresh_token: 'old' });
  await expect(session.accessToken(jar)).rejects.toMatchObject({ status });
  expect(jar.delete.mock.calls.length > 0).toBe(cleared);
});
it('refreshes a rejected GET once, but never replays an unsafe request', async () => {
  const jar = cookies({ fulcra_access_token: 'expired', fulcra_refresh_token: 'refresh' });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(reply({}, 401))
    .mockResolvedValueOnce(reply({ access_token: 'new', expires_in: 60 }))
    .mockResolvedValueOnce(reply({ ok: true }));
  vi.stubGlobal('fetch', fetcher);
  expect((await session.authorizedFetch(jar, 'https://api.example/info')).ok).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(3);
  fetcher
    .mockReset()
    .mockResolvedValueOnce(reply({ sub: 'user' }))
    .mockResolvedValueOnce(reply({}, 401));
  await expect(
    session.authorizedFetch(jar, 'https://api.example/change', { method: 'POST', body: '{}' })
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('rejects foreign and missing origins for JSON mutations including logout', async () => {
  const { handle } = await import('../../hooks.server.js');
  for (const origin of [null, 'https://evil.example']) {
    const event = {
      url: new URL('https://app.example/api/auth/revoke'),
      request: new Request('https://app.example/api/auth/revoke', {
        method: 'POST',
        headers: origin ? { Origin: origin, 'Content-Type': 'application/json' } : {}
      })
    };
    expect(
      (
        await handle({
          event: /** @type {import('@sveltejs/kit').RequestEvent} */ (
            /** @type {unknown} */ (event)
          ),
          resolve: vi.fn()
        })
      ).status
    ).toBe(403);
  }
});
it('revokes from cookies and clears them even when the provider fails', async () => {
  const jar = cookies({ fulcra_refresh_token: 'reload-token', fulcra_access_token: 'access' });
  const fetcher = vi.fn(async (url, options) => {
    expect(JSON.parse(options.body).token).toBe('reload-token');
    return reply({}, 503);
  });
  vi.stubGlobal('fetch', fetcher);
  expect(await session.logout(jar)).toBe(false);

  expect(jar.get('fulcra_refresh_token')).toBeUndefined();
  expect(jar.get('fulcra_access_token')).toBeUndefined();
});

it('device exchange stores cookies but returns neither access nor refresh tokens', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      reply({
        access_token: 'secret-access',
        refresh_token: 'secret-refresh',
        id_token: 'secret-id',
        expires_in: 3600
      })
    )
  );
  const { POST } = await import('../../routes/api/auth/device/token/+server.js');
  const jar = cookies();
  const result = await POST(
    /** @type {any} */ ({
      cookies: jar,
      request: new Request('https://app.example/api/auth/device/token', {
        method: 'POST',
        body: JSON.stringify({ deviceCode: 'device' })
      })
    })
  );
  expect(await result.json()).toEqual({ status: 200 });
  expect(jar.get('fulcra_access_token')).toBe('secret-access');
  expect(jar.get('fulcra_refresh_token')).toBe('secret-refresh');
});

it('requires offline access at login rather than silently issuing a non-renewable session', async () => {
  const jar = cookies();
  expect(() => session.storeTokens(jar, { access_token: 'access', expires_in: 60 })).toThrow();
  expect(jar.set).not.toHaveBeenCalled();
  const fetcher = vi.fn(async (url, options) => {
    expect(JSON.parse(options.body).scope.split(' ')).toContain('offline_access');
    return reply({ device_code: 'device' });
  });
  vi.stubGlobal('fetch', fetcher);
  const { POST } = await import('../../routes/api/auth/device/code/+server.js');
  await POST();
  expect(fetcher).toHaveBeenCalledOnce();
});

it('does not refresh on permission denial or discard cookies on network errors', async () => {
  const jar = cookies({ fulcra_access_token: 'access', fulcra_refresh_token: 'refresh' });
  const fetcher = vi.fn(async () => reply({}, 403));
  vi.stubGlobal('fetch', fetcher);
  await expect(session.authorizedFetch(jar, 'https://api.example/info')).rejects.toMatchObject({
    status: 403
  });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(jar.delete).not.toHaveBeenCalled();
  fetcher.mockRejectedValue(new Error('offline'));
  await expect(session.accessToken(jar, true)).rejects.toMatchObject({ status: 503 });
  expect(jar.delete).not.toHaveBeenCalled();
});

it('does not revive a rotated token from the grace cache after logout', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply({ access_token: 'new', refresh_token: 'rotated', expires_in: 60 }))
  );
  const jar = cookies({ fulcra_refresh_token: 'old' });
  await session.accessToken(jar);
  await session.logout(jar);
  await expect(session.accessToken(cookies({ fulcra_refresh_token: 'old' }))).rejects.toMatchObject(
    { status: 401 }
  );
});

it('allows same-origin mutations and marks API responses non-cacheable', async () => {
  const { handle } = await import('../../hooks.server.js');
  const event = {
    url: new URL('https://app.example/api/auth/revoke'),
    request: new Request('https://app.example/api/auth/revoke', {
      method: 'POST',
      headers: { Origin: 'https://app.example' }
    })
  };
  const resolve = vi.fn(async () => reply({}));
  const result = await handle({ event: /** @type {any} */ (event), resolve });
  expect(resolve).toHaveBeenCalledOnce();
  expect(result.headers.get('cache-control')).toBe('no-store');
});

it('coordinates logout with an overlapping refresh and revokes its rotated token', async () => {
  /** @type {(response: Response) => void} */
  let finish = () => {};
  const renewal = new Promise((resolve) => {
    finish = resolve;
  });
  const fetcher = vi.fn(async (url, options) => {
    if (url.endsWith('/oauth/token')) return renewal;
    expect(JSON.parse(options.body).token).toBe('rotated');
    return reply({});
  });
  vi.stubGlobal('fetch', fetcher);
  const refreshing = cookies({ fulcra_refresh_token: 'old' });
  const leaving = cookies({ fulcra_refresh_token: 'old' });
  const denied = expect(session.accessToken(refreshing)).rejects.toMatchObject({ status: 401 });
  const logout = session.logout(leaving);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(leaving.get('fulcra_refresh_token')).toBeUndefined();
  finish(reply({ access_token: 'new', refresh_token: 'rotated', expires_in: 60 }));
  await denied;
  expect(await logout).toBe(true);
  expect(refreshing.set).not.toHaveBeenCalled();
  expect(refreshing.get('fulcra_refresh_token')).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('rejects cross-site Fetch Metadata even with a matching Origin', async () => {
  const { handle } = await import('../../hooks.server.js');
  const event = {
    url: new URL('https://app.example/api/auth/revoke'),
    request: new Request('https://app.example/api/auth/revoke', {
      method: 'POST',
      headers: { Origin: 'https://app.example', 'Sec-Fetch-Site': 'cross-site' }
    })
  };
  const resolve = vi.fn(async () => reply({}));
  const result = await handle({ event: /** @type {any} */ (event), resolve });
  expect(result.status).toBe(403);
  expect(resolve).not.toHaveBeenCalled();
});
