import { File } from 'expo-file-system';
import { type ApiError, createApiClient } from '../lib/api';
import { API_URL } from '../lib/config';
import { createSecureTokenStore } from './token-store';

const tokens = createSecureTokenStore();
const sessionEndedListeners = new Set<(error: ApiError) => void>();

/**
 * The one signed-in API client. Screens get it from useAuth(); the background location task (which runs
 * outside React) imports it directly, so both share the same tokens and refresh.
 */
export const signedInApi = createApiClient(API_URL, {
  tokens,
  fileFromUri: (uri) => new File(uri),
  onSessionEnded: (error) => {
    for (const listener of sessionEndedListeners) listener(error);
  },
});

/** Called when the server ends the session (revoked, suspended, deleted). */
export function onSessionEnded(listener: (error: ApiError) => void): () => void {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

export async function hasStoredSession(): Promise<boolean> {
  return (await tokens.getRefreshToken()) !== null;
}
