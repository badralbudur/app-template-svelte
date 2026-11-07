import { env } from '$env/dynamic/public';
import { error, json } from '@sveltejs/kit';
import { storeTokens } from '$lib/server/session.js';

export async function POST({ request, cookies }) {
  const { deviceCode } = await request.json();
  if (typeof deviceCode !== 'string' || !deviceCode) error(400, 'Device code required');
  let response;
  try {
    response = await fetch(`https://${env.PUBLIC_AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
        client_id: env.PUBLIC_AUTH0_CLIENT_ID
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    error(503, 'Failed to poll for token');
  }
  const data = await response.json();
  if (response.ok) {
    storeTokens(cookies, data);
    return json({ status: 200 });
  }
  // Allowlist errors; never forward provider token payloads to the browser.
  return json({
    status: response.status,
    data: { error: data.error, error_description: data.error_description }
  });
}
