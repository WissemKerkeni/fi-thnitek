import type { DeviceInfo } from '@fi-thnitek/contracts';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const INSTALL_ID_KEY = 'fi-thnitek.install-id';

/** A random UUID created once per install (R-004). Never a hardware or advertising ID. */
async function installId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALL_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALL_ID_KEY, id);
  return id;
}

export async function deviceInfo(): Promise<DeviceInfo> {
  return {
    installId: await installId(),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
  };
}
