<script>
  import QRCode from 'qrcode';

  /** @type {{ verificationUri: string, userCode: string }} */
  let { verificationUri, userCode } = $props();
</script>

<p class="text-[14px] leading-relaxed">
  Copy this link into your main browser, or scan the QR code with your phone.
  <span class="font-medium">Keep this app open—it signs you in when you’re done.</span>
</p>

<!-- select-all: one click selects the whole link, ready to copy. -->
<p
  aria-label="Sign-in link"
  class="mt-3 rounded border border-fulcra-black-25 bg-fulcra-black-50 p-3 font-mono text-[13px] break-all select-all"
>
  {verificationUri}
</p>

{#await QRCode.toString(verificationUri, { type: 'svg', margin: 4 }) then svg}
  <img
    src="data:image/svg+xml,{encodeURIComponent(svg)}"
    alt="Scan to open the sign-in page"
    width="160"
    height="160"
    class="mx-auto mt-4 rounded bg-white"
  />
{/await}

<p class="mt-3 text-center text-[13px] text-fulcra-gray">
  The sign-in page will show this code: <span class="font-mono text-fulcra-white">{userCode}</span>
</p>
