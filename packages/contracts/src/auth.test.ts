import { describe, expect, it } from 'vitest';
import { DisplayName, GoogleSignInRequest, RegisterDeviceRequest, UpdateMeRequest } from './auth.js';

const device = {
  installId: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  platform: 'android',
  appVersion: '0.0.0',
};

describe('auth contracts', () => {
  it('accepts a sign-in with or without device info', () => {
    expect(GoogleSignInRequest.safeParse({ idToken: 'x.y.z', device }).success).toBe(true);
    expect(GoogleSignInRequest.safeParse({ idToken: 'x.y.z' }).success).toBe(true);
    expect(GoogleSignInRequest.safeParse({ idToken: '' }).success).toBe(false);
  });

  it('requires the install ID to be a UUID, not a hardware identifier', () => {
    expect(
      GoogleSignInRequest.safeParse({ idToken: 't', device: { ...device, installId: '9774d56d682e549c' } })
        .success,
    ).toBe(false);
  });

  it('accepts Arabic and French display names and rejects symbols', () => {
    expect(DisplayName.parse('  سامي ')).toBe('سامي');
    expect(DisplayName.parse('Hédi Ben-Ali')).toBe('Hédi Ben-Ali');
    expect(DisplayName.safeParse('S').success).toBe(false);
    expect(DisplayName.safeParse('<script>').success).toBe(false);
    expect(DisplayName.safeParse('0612345678').success).toBe(false);
  });

  it('rejects an empty profile update', () => {
    expect(UpdateMeRequest.safeParse({}).success).toBe(false);
    expect(UpdateMeRequest.safeParse({ locale: 'fr' }).success).toBe(true);
  });

  it('lets a device clear its push token', () => {
    expect(RegisterDeviceRequest.parse({ ...device, pushToken: null }).pushToken).toBeNull();
  });
});
