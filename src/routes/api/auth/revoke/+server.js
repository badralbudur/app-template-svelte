import { json } from '@sveltejs/kit';
import { logout } from '$lib/server/session.js';

export async function POST({ cookies }) {
  const revoked = await logout(cookies);
  return json({ signedOut: true, revoked });
}
