<script>
  import QRCode from 'qrcode';

  /** @type {{ verificationUri: string, userCode: string }} */
  let { verificationUri, userCode } = $props();
  let qrCode = $state('');
  let qrError = $state(false);
  let copyStatus = $state('');

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(verificationUri);
      copyStatus = 'Link copied.';
    } catch {
      copyStatus = 'Select and copy the link above to sign in.';
    }
  }

  $effect(() => {
    let active = true;
    qrCode = '';
    qrError = false;
    copyStatus = '';
    QRCode.toString(verificationUri, { type: 'svg', margin: 4 }).then(
      /** @param {string} svg */
      (svg) => {
        if (active) qrCode = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      },
      () => {
        if (active) qrError = true;
      }
    );
    return () => {
      active = false;
    };
  });
</script>

<div
  class="mt-1 rounded-lg border border-fulcra-teal/50 bg-fulcra-teal/10 p-4 text-[14px] leading-relaxed"
>
  <p class="font-medium">No sign-in popup?</p>
  <p>
    Paste this link into your main browser, scan the QR code, or open the sign-in page in a new tab.
  </p>
  <p class="mt-2 font-medium">Keep this app open—it will sign you in when you’re done.</p>
</div>

<div class="mt-4 flex flex-wrap items-center justify-center gap-4">
  {#if qrCode}
    <img
      src={qrCode}
      alt="Scan to open the sign-in page"
      width="160"
      height="160"
      class="rounded bg-white"
    />
  {/if}
  <div class="text-center">
    <p class="text-[13px] text-fulcra-gray">Your code</p>
    <p class="font-mono text-xl tracking-widest select-all">{userCode}</p>
  </div>
</div>

{#if qrError}
  <p class="mt-2 text-[13px] text-fulcra-gray">
    QR code unavailable. Use the sign-in link instead.
  </p>
{/if}
<label for="sign-in-link" class="mt-4 block text-[13px] text-fulcra-gray">Sign-in link</label>
<input
  id="sign-in-link"
  type="text"
  readonly
  value={verificationUri}
  class="mt-1 w-full min-w-0 rounded border border-fulcra-black-25 bg-fulcra-black-50 p-3 text-[13px]"
/>
<button
  type="button"
  onclick={copyLink}
  class="mt-2 w-full rounded-lg bg-fulcra-teal/20 p-3 text-[14px] font-medium text-fulcra-teal hover:bg-fulcra-teal/50 hover:text-fulcra-black"
  >Copy link</button
>
<p role="status" class="mt-1 text-[13px] text-fulcra-gray">{copyStatus}</p>
<!-- The verification URL is external, not a SvelteKit route. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
  href={verificationUri}
  target="_blank"
  rel="noopener noreferrer"
  class="mt-3 block rounded-lg border border-fulcra-teal/50 p-3 text-center text-[14px] font-medium text-fulcra-teal hover:bg-fulcra-teal/10"
>
  Open sign-in page in new tab
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
