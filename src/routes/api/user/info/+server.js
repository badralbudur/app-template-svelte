import { json } from '@sveltejs/kit';
import { apiFor } from '$lib/server/api.js';

export async function GET({ cookies }) {
  return json(await apiFor(cookies).getUserInfo());
}

// Registration is a mutation: never perform it from a CSRF-exempt GET.
export async function POST({ cookies }) {
  const api = apiFor(cookies);
  try {
    return json(await api.getUserInfo());
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes('404')) throw err;
    await api.post('user/v0/register', {});
    return json(await api.getUserInfo());
  }
}
