import { json } from '@sveltejs/kit';
import { apiFor } from '$lib/server/api.js';

export async function GET({ cookies }) {
  return json(await apiFor(cookies).getUserPreferences());
}
