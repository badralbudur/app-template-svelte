/**
 * Auth0 Device Authorization Flow implementation
 *
 * This flow is designed for devices without browsers (CLI, TV apps, etc.)
 * but works for web apps too - avoids callback URL restrictions.
 *
 * Flow:
 * 1. Request device code from Auth0
 * 2. Display verification URL and user code to user
 * 3. User visits URL on any device and enters code
 * 4. Poll Auth0 until user completes authentication
 * 5. Server stores tokens in HTTP-only cookies; browser receives success only
 */

export class Auth0DeviceFlow {
  /**
   * Start the device authorization flow
   * Returns verification URL and user code for the user to complete auth
   * Uses server route to bypass CORS
   */
  async startDeviceFlow() {
    const response = await fetch('/api/auth/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Failed to start device flow');
    }

    const data = await response.json();

    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri_complete || data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval || 5
    };
  }

  /**
   * Poll for token after user has been shown the verification URL
   * Uses server route to bypass CORS
   * @param {string} deviceCode
   * @param {number} [interval]
   * @param {() => boolean} [isCurrent]
   * @param {AbortSignal} [signal]
   */
  async pollForToken(deviceCode, interval = 5, isCurrent = () => true, signal) {
    const maxAttempts = 60; // 5 minutes with 5 second intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;

      // Wait for the interval before polling
      await new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', done);
          resolve(undefined);
        };
        const timer = setTimeout(done, interval * 1000);
        signal?.addEventListener('abort', done, { once: true });
        if (signal?.aborted) done();
      });

      if (!isCurrent()) throw new Error('Login cancelled');
      const response = await fetch('/api/auth/device/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceCode })
      });

      if (!isCurrent()) throw new Error('Login cancelled');
      if (!response.ok) {
        throw new Error('Failed to poll for token');
      }

      const result = await response.json();

      // Check if token request was successful
      if (result.status === 200) {
        return;
      }

      const error = result.data;

      // authorization_pending means user hasn't completed auth yet, keep polling
      if (error.error === 'authorization_pending') {
        continue;
      }

      // slow_down means we're polling too fast
      if (error.error === 'slow_down') {
        interval += 5;
        continue;
      }

      // Any other error means we should stop
      throw new Error(error.error_description || error.error);
    }

    throw new Error('Device flow timed out');
  }
}
