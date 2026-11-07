import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { FulcraAPI } from '$lib/api-client.js';
import { authorizedFetch } from './session.js';

/** @param {import('./session.js').CookieJar} cookies */
export function apiFor(cookies) {
  if (!env.PUBLIC_FULCRA_API_ENDPOINT) error(503, 'API endpoint is not configured');
  return new FulcraAPI(env.PUBLIC_FULCRA_API_ENDPOINT, undefined, (url, options) =>
    authorizedFetch(cookies, url, options)
  );
}
