import type { TokenPair } from '@fi-thnitek/contracts';
import * as SecureStore from 'expo-secure-store';
import type { TokenStore } from '../lib/api';

const REFRESH_KEY = 'fi-thnitek.refresh-token';

/**
 * The refresh token lives in the OS keystore (expo-secure-store, excluded from backups);
 * the 15-min access token only in memory.
 */
export function createSecureTokenStore(): TokenStore {
  let accessToken: string | null = null;
  return {
    getAccessToken: () => accessToken,
    getRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
    async save(pair: TokenPair) {
      accessToken = pair.accessToken;
      await SecureStore.setItemAsync(REFRESH_KEY, pair.refreshToken);
    },
    async clear() {
      accessToken = null;
      await SecureStore.deleteItemAsync(REFRESH_KEY);
    },
  };
}
