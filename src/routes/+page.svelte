<script>
  import { user } from '$lib/user';

  /** @type {{ timezone?: string } | null} */
  let preferences = $state(null);
  let loadingPreferences = $state(false);

  async function fetchPreferences() {
    loadingPreferences = true;
    try {
      const response = await user.request('/api/user/preferences');
      if (response.ok) {
        preferences = await response.json();
      } else {
        console.error('Failed to fetch preferences:', response.status);
      }
    } catch (error) {
      console.error('Error fetching preferences:', error);
    } finally {
      loadingPreferences = false;
    }
  }
</script>

<div class="flex h-full min-h-screen items-center justify-center">
  <div class="text-center">
    <div class="mb-4 text-6xl text-fulcra-teal">🚀</div>
    <h1 class="mb-2 text-3xl font-bold text-fulcra-white">Fulcra App Template</h1>
    <p class="text-fulcra-gray">A SvelteKit template for building on the Fulcra platform</p>
    <div class="mt-6">
      <p class="text-sm text-fulcra-gray">
        User ID: <span class="text-fulcra-teal"
          >{$user.auth0UserInfo['fulcradynamics.com/userid']}</span
        >
      </p>

      {#if preferences}
        <p class="mt-2 text-sm text-fulcra-gray">
          Timezone: <span class="text-fulcra-teal">{preferences.timezone || 'Not set'}</span>
        </p>
      {/if}

      <div class="mt-4 flex justify-center gap-2">
        <button
          class="rounded-lg bg-fulcra-purple/20 px-4 py-2 text-fulcra-purple hover:bg-fulcra-purple/50 disabled:opacity-50"
          on:click={fetchPreferences}
          disabled={loadingPreferences}
        >
          {loadingPreferences ? 'Loading...' : 'Fetch Timezone'}
        </button>
        <button
          class="rounded-lg bg-fulcra-teal/20 px-4 py-2 text-fulcra-teal hover:bg-fulcra-teal/50"
          on:click={user.logout}>Sign Out</button
        >
      </div>
    </div>
  </div>
</div>
