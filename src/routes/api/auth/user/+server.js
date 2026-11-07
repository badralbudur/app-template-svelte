import { env } from '$env/dynamic/public';
import { error, json } from '@sveltejs/kit';
import { authorizedFetch } from '$lib/server/session.js';

export async function GET({ cookies }) {
  const response = await authorizedFetch(cookies, `https://${env.PUBLIC_AUTH0_DOMAIN}/userinfo`);
  if (!response.ok) error(response.status === 403 ? 403 : 503, 'Unable to fetch profile');
  return json(await response.json());
}
