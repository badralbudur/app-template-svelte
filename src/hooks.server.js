import { json } from '@sveltejs/kit';

// SvelteKit's form protection alone does not cover JSON endpoints.
export async function handle({ event, resolve }) {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) &&
    (event.request.headers.get('origin') !== event.url.origin ||
      event.request.headers.get('sec-fetch-site') === 'cross-site')
  ) {
    return json({ message: 'Same-origin request required' }, { status: 403 });
  }
  const response = await resolve(event);
  if (event.url.pathname.startsWith('/api/')) response.headers.set('Cache-Control', 'no-store');
  return response;
}
