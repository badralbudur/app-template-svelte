import { env } from '$env/dynamic/public';
import { error, json } from '@sveltejs/kit';

export async function POST() {
  let response;
  try {
    response = await fetch(`https://${env.PUBLIC_AUTH0_DOMAIN}/oauth/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.PUBLIC_AUTH0_CLIENT_ID,
        audience: env.PUBLIC_FULCRA_API_ENDPOINT,
        scope: 'openid profile email offline_access'
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    error(503, 'Failed to start device flow');
  }
  if (!response.ok) error(503, 'Failed to start device flow');
  const data = await response.json();
  return json({
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    verification_uri_complete: data.verification_uri_complete,
    expires_in: data.expires_in,
    interval: data.interval
  });
}
