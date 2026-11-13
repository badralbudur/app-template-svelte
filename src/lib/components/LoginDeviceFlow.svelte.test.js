import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import LoginDeviceFlow from './LoginDeviceFlow.svelte';
import SignInHandoff from './SignInHandoff.svelte';
import { user } from '$lib/user';
import QRCode from 'qrcode';

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
  vi.unstubAllGlobals();
});

test('copies the complete sign-in URL and confirms success', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(SignInHandoff, {
    verificationUri: verificationInfo.verificationUri,
    userCode: verificationInfo.userCode
  });
  await fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
  expect(writeText).toHaveBeenCalledWith(verificationInfo.verificationUri);
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Link copied.');
  vi.unstubAllGlobals();
});

test.each([undefined, { writeText: () => Promise.reject(new Error('denied')) }])(
  'clipboard unavailable or denied leaves manual copying usable: %s',
  async (clipboard) => {
    vi.stubGlobal('navigator', { clipboard });
    render(SignInHandoff, {
      verificationUri: verificationInfo.verificationUri,
      userCode: verificationInfo.userCode
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/Select and copy the link/)
    );
    expect(screen.getByRole('textbox', { name: 'Sign-in link' })).toHaveProperty(
      'value',
      verificationInfo.verificationUri
    );
  }
);

test('QR generation failure leaves the link and code usable', async () => {
  vi.spyOn(QRCode, 'toString').mockRejectedValue(new Error('QR failure'));
  render(SignInHandoff, {
    verificationUri: verificationInfo.verificationUri,
    userCode: verificationInfo.userCode
  });
  expect(
    await screen.findByText('QR code unavailable. Use the sign-in link instead.')
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Open sign-in page in new tab' }).getAttribute('href')
  ).toBe(verificationInfo.verificationUri);
  expect(screen.getByText(verificationInfo.userCode)).toBeTruthy();
});

test.each(['none', 'qr', 'clipboard'])(
  'login completes and removes the handoff despite a %s failure',
  async (failure) => {
    if (failure === 'qr') vi.spyOn(QRCode, 'toString').mockRejectedValue(new Error('QR failure'));
    if (failure === 'clipboard') vi.stubGlobal('navigator', { clipboard: undefined });
    const popup = { closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(
      /** @type {Window} */ (/** @type {unknown} */ (popup))
    );
    vi.mocked(user.startLogin).mockImplementation(async () => {
      expect(window.open).toHaveBeenCalled();
      return verificationInfo;
    });
    let finish = () => {};
    vi.mocked(user.completeLogin).mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve(undefined);
      })
    );
    render(LoginDeviceFlow);
    await fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(await screen.findByRole('textbox', { name: 'Sign-in link' })).toBeTruthy();
    expect(user.startLogin).toHaveBeenCalledWith(popup);
    if (failure === 'clipboard') {
      await fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toMatch(/Select and copy/)
      );
    }
    if (failure === 'qr')
      expect(
        await screen.findByText('QR code unavailable. Use the sign-in link instead.')
      ).toBeTruthy();
    finish();
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Sign-in link' })).toBeNull());
    expect(popup.close).toHaveBeenCalledOnce();
  }
);

test('blocked popup leaves a visible URL, code, QR and separate new-tab handoff while polling', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null);
  vi.mocked(user.startLogin).mockResolvedValue(verificationInfo);
  vi.mocked(user.completeLogin).mockReturnValue(new Promise(() => {}));
  render(LoginDeviceFlow);
  await fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

  const url = await screen.findByRole('textbox', { name: 'Sign-in link' });
  expect(url).toHaveProperty('value', verificationInfo.verificationUri);
  expect(url).toHaveProperty('readOnly', true);
  expect(screen.getByText(verificationInfo.userCode)).toBeTruthy();
  const link = screen.getByRole('link', { name: 'Open sign-in page in new tab' });
  expect(link.getAttribute('href')).toBe(verificationInfo.verificationUri);
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(screen.getByText(/Paste this link into your main browser/)).toBeTruthy();
  expect(screen.getByText(/Keep this app open/)).toBeTruthy();
  const qr = await screen.findByAltText('Scan to open the sign-in page');
  await waitFor(() => expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/));
  expect(user.completeLogin).toHaveBeenCalledWith(verificationInfo.deviceCode, 5);
});
