import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import LoginDeviceFlow from './LoginDeviceFlow.svelte';
import { user } from '$lib/user';

vi.mock('$lib/user', () => ({
  user: { startLogin: vi.fn(), completeLogin: vi.fn() }
}));

const verificationInfo = {
  verificationUri: 'https://example.auth0.com/activate?user_code=ABCD-EFGH',
  userCode: 'ABCD-EFGH',
  deviceCode: 'test-device-code',
  interval: 5
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test('blocked popup shows the selectable link, QR code and user code while polling', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null);
  vi.mocked(user.startLogin).mockResolvedValue(verificationInfo);
  vi.mocked(user.completeLogin).mockReturnValue(new Promise(() => {}));
  render(LoginDeviceFlow);
  await fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

  const link = await screen.findByLabelText('Sign-in link');
  expect(screen.getByRole('heading', { name: 'Was the sign-in popup blocked?' })).toBeTruthy();
  expect(link.textContent?.trim()).toBe(verificationInfo.verificationUri);
  expect(link.classList).toContain('select-all');
  expect(screen.getByText(verificationInfo.userCode)).toBeTruthy();
  const qr = await screen.findByAltText('Scan to open the sign-in page');
  expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/);
  expect(user.completeLogin).toHaveBeenCalledWith(verificationInfo.deviceCode, 5);
});

test('completed login closes the popup and removes the handoff', async () => {
  const popup = { closed: false, close: vi.fn() };
  vi.spyOn(window, 'open').mockReturnValue(/** @type {Window} */ (/** @type {unknown} */ (popup)));
  vi.mocked(user.startLogin).mockResolvedValue(verificationInfo);
  let finish = () => {};
  vi.mocked(user.completeLogin).mockReturnValue(
    new Promise((resolve) => {
      finish = () => resolve(undefined);
    })
  );
  render(LoginDeviceFlow);
  await fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
  await screen.findByLabelText('Sign-in link');
  expect(user.startLogin).toHaveBeenCalledWith(popup);

  finish();
  await waitFor(() => expect(screen.queryByLabelText('Sign-in link')).toBeNull());
  expect(popup.close).toHaveBeenCalledOnce();
});
