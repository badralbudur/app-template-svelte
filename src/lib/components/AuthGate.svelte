<script>
  import { onMount } from 'svelte';
  import { user } from '$lib/user';
  import LoginDeviceFlow from '$lib/components/LoginDeviceFlow.svelte';

  /** @type {{ children: import('svelte').Snippet }} */
  let { children } = $props();
  onMount(() => {
    void user.init();
  });
</script>

{#if $user.status === 'signing-out'}
  <p role="status">Signing out… Waiting for outstanding requests and server confirmation.</p>
{:else if $user.status === 'error'}
  <p role="alert">{$user.message}</p>
  <button onclick={() => user.logout()}>Sign Out</button>
{:else if $user.status === 'authenticated'}
  {@render children()}
{:else if $user.status === 'signed-out'}
  <LoginDeviceFlow />
{/if}
