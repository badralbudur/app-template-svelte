<script>
  import { user } from '$lib/user';
  import fulcraLogo from '$lib/assets/app-icon_152.png';
  import SignInHandoff from './SignInHandoff.svelte';
  // import appLogo from '$lib/assets/your-logo.svg';

  // ---- fill these in for your app ----
  const appName = 'Your App Name';
  const tagline = "One line on what your app does with a person's Fulcra data.";
  const description =
    'A starter template you can clone and build on. Sign-in and user accounts work from the first commit — replace this copy with your own and start shipping.';
  const showSlots = true; // set false once you've replaced the placeholders

  let verificationInfo = $state(null);
  let polling = $state(false);
  let error = $state(null);

  async function startLogin() {
    // Open the popup synchronously within the click gesture. Safari only permits
    // window.open() in the same call stack as the user gesture; opening it after
    // an await gets blocked. We hand the window to user.startLogin(), which
    // navigates it (first to Auth0 logout to clear the SSO session, then to the
    // device-flow verification URL).
    const popup = window.open(
      'about:blank',
      'auth0-device-flow',
      'width=500,height=700,left=100,top=100'
    );

    try {
      error = null;
      verificationInfo = await user.startLogin(popup);

      // Start polling for token
      polling = true;
      await user.completeLogin(verificationInfo.deviceCode, verificationInfo.interval);

      // Close popup if still open
      if (popup && !popup.closed) {
        popup.close();
      }

      // If we get here, login succeeded
      polling = false;
      verificationInfo = null;
    } catch (err) {
      console.error('Login error:', err);
      if (popup && !popup.closed) {
        popup.close();
      }
      error = err.message;
      polling = false;
      verificationInfo = null;
    }
  }
</script>

<!-- -m-3 cancels the global p-3 gutter from +layout.svelte so the screen is full-bleed -->
<div class="relative -m-3 flex min-h-screen flex-col bg-fulcra-black text-fulcra-white">
  <!-- grid wash -->
  <div
    class="pointer-events-none absolute inset-0 bg-[linear-gradient(#ffffff0a_1px,transparent_1px),linear-gradient(90deg,#ffffff0a_1px,transparent_1px)] [mask-image:radial-gradient(70%_55%_at_50%_40%,#000_0%,transparent_100%)] bg-[length:72px_72px]"
  ></div>
  <div
    class="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,#22222a_0%,transparent_62%)]"
  ></div>

  <header
    class="sticky top-0 z-20 flex flex-none items-center justify-between gap-6 bg-fulcra-black/70 px-7 py-5 backdrop-blur-sm"
  >
    <div class="flex items-center gap-3">
      <!-- replace this slot with <img src={appLogo} alt={appName} class="h-[30px]" /> -->
      <div
        class="grid h-[30px] min-w-[86px] place-items-center rounded-[7px] border border-dashed border-[#3d3d44] bg-[repeating-linear-gradient(135deg,#ffffff08_0_6px,transparent_6px_12px)] px-3"
      >
        <span class="font-mono text-[9.5px] tracking-[0.09em] text-fulcra-gray uppercase"
          >your logo</span
        >
      </div>
      <span class="text-[11px] leading-none tracking-[0.06em] text-fulcra-gray uppercase"
        >powered by</span
      >
      <div class="flex items-center gap-2">
        <img src={fulcraLogo} alt="Fulcra" class="block h-[26px] w-[26px] rounded-md" />
        <span class="text-[13.5px] font-medium tracking-[0.01em]">Fulcra</span>
      </div>
    </div>
    <div class="flex items-center gap-5 text-[13px]">
      <a
        href="https://docs.fulcradynamics.com"
        target="_blank"
        rel="noopener noreferrer"
        class="text-fulcra-gray hover:text-fulcra-white">Docs</a
      >
      <a
        href="https://support.fulcradynamics.com/en/"
        target="_blank"
        rel="noopener noreferrer"
        class="text-fulcra-gray hover:text-fulcra-white">Support</a
      >
    </div>
  </header>

  <main class="relative grid flex-1 place-items-center px-6 pt-6 pb-14">
    <div class="w-full max-w-[452px]">
      <div class="mb-9 flex flex-col gap-3.5">
        {#if showSlots}
          <span
            class="self-start rounded-[5px] border border-fulcra-black-25 px-[7px] py-1 font-mono text-[10px] tracking-[0.1em] text-fulcra-gray uppercase"
            >app_name</span
          >
        {/if}
        <h1 class="text-[38px] leading-[1.08] font-medium tracking-[-0.02em]">{appName}</h1>
        <p class="text-[16.5px] leading-[1.5] tracking-[-0.008em] text-pretty text-[#d6d6da]">
          {tagline}
        </p>
        <p class="mt-1 text-[14.5px] leading-[1.65] text-pretty text-fulcra-gray">{description}</p>
      </div>

      <div class="rounded-lg border border-solid border-fulcra-black-25 bg-[#1b1b23] p-[22px]">
        <h2 class="mb-4 text-[15px] font-medium tracking-[-0.01em]">Get started</h2>

        {#if !verificationInfo}
          <div class="flex flex-col gap-2.5">
            <button
              class="btn h-12 w-full rounded-lg bg-fulcra-teal/20 text-[14.5px] font-medium text-fulcra-teal transition-colors hover:bg-fulcra-teal/50 hover:text-fulcra-black"
              on:click={startLogin}>Sign In</button
            >
            <button
              class="btn h-12 w-full rounded-lg border border-solid border-fulcra-black-25 bg-transparent text-[14.5px] font-normal text-fulcra-white transition-colors hover:border-fulcra-black-20 hover:bg-fulcra-black-50"
              on:click={startLogin}>Create Account</button
            >
          </div>

          {#if error}
            <p class="mt-3 text-[13px] text-fulcra-error">{error}</p>
          {/if}

          <p class="mt-4 text-[12px] leading-[1.6] text-pretty text-fulcra-gray">
            Opens a secure Auth0 window. By continuing you agree to the
            <a
              href="https://fulcra.ai/legal/terms-conditions"
              target="_blank"
              rel="noopener noreferrer"
              class="text-fulcra-gray underline hover:text-fulcra-white">Terms</a
            >
            and
            <a
              href="https://fulcra.ai/legal/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              class="text-fulcra-gray underline hover:text-fulcra-white">Privacy Policy</a
            >.
          </p>
        {:else}
          <SignInHandoff
            verificationUri={verificationInfo.verificationUri}
            userCode={verificationInfo.userCode}
          />

          {#if polling}
            <div class="mt-4 flex items-center justify-center gap-2 text-fulcra-gray">
              <div class="loading loading-sm loading-spinner"></div>
              <span class="text-[13px]">Waiting for authentication…</span>
            </div>
          {/if}
        {/if}
      </div>

      <div class="mt-5 flex items-center gap-2.5 pl-0.5">
        <span class="h-[5px] w-[5px] flex-none rounded-full bg-fulcra-teal"></span>
        <p class="text-[12.5px] text-fulcra-gray">
          Sign-in handled by Auth0. Data access via the
          <a
            href="https://docs.fulcradynamics.com"
            class="text-fulcra-gray underline hover:text-fulcra-white">Fulcra API</a
          >.
        </p>
      </div>

      {#if showSlots}
        <div class="mt-7 flex flex-col gap-[7px] border-t border-fulcra-black-25 pt-4">
          <p class="font-mono text-[11px] leading-[1.7] text-fulcra-gray">
            Template slots on this screen: your logo, app_name, tagline, description.
          </p>
          <p class="font-mono text-[11px] leading-[1.7] text-fulcra-gray">
            Replace them in your fork, then set showSlots to false.
          </p>
        </div>
      {/if}
    </div>
  </main>
</div>
