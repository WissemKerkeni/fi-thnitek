import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { SHARING_KEY, isDriverAccount, useSharingActions, useSharingStatus } from './useSharing';
import { flush, isTracking, onTrackingStopped, startTracking, stopTracking } from './tracking';

/**
 * Keeps the phone's location service in line with the server session, from any screen:
 * - SHARING on the server but no service (e.g. the app was killed and reopened) → restart it; the first
 *   upload then reveals the gap and the server decides (PING_GAP → cooldown, R-057);
 * - no session or on break → make sure the service is stopped;
 * - asks "Still working?" when the server is waiting for the answer (R-058).
 */
export function SharingSupervisor() {
  const { session } = useAuth();
  const driver = session.status === 'signedIn' && isDriverAccount(session.me.driverVerification);
  return driver ? <Supervisor /> : null;
}

function Supervisor() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useSharingStatus();
  const { stillWorking } = useSharingActions();
  const asked = useRef<string | null>(null);
  const state = status.data?.session?.state ?? null;
  const tracking = status.data?.tracking;

  useEffect(() => {
    void (async () => {
      if (state === 'SHARING' && tracking) {
        const { granted } = await Location.getForegroundPermissionsAsync();
        if (granted && !(await isTracking())) {
          await startTracking(tracking, {
            title: t('sharing.notificationTitle'),
            body: t('sharing.notificationBody'),
          }).catch(() => undefined);
        }
        void flush();
      } else if (status.isSuccess && (await isTracking())) {
        await stopTracking();
      }
    })();
  }, [state, tracking, status.isSuccess, t]);

  useEffect(() => {
    const unsubscribe = onTrackingStopped(
      () => void queryClient.invalidateQueries({ queryKey: SHARING_KEY }),
    );
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void queryClient.invalidateQueries({ queryKey: SHARING_KEY });
        void flush();
      }
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [queryClient]);

  const s = status.data?.session;
  useEffect(() => {
    if (!s?.stillWorkingPending || asked.current === s.id) return;
    asked.current = s.id;
    Alert.alert(t('sharing.stillWorkingTitle'), t('sharing.stillWorkingBody'), [
      { text: t('sharing.stillWorkingYes'), onPress: () => stillWorking.mutate() },
    ]);
  }, [s?.id, s?.stillWorkingPending, stillWorking, t]);

  useEffect(() => {
    if (s && !s.stillWorkingPending && asked.current === s.id) asked.current = null;
  }, [s]);

  return null;
}
