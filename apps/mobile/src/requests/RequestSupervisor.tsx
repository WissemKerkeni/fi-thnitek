import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { isDriverAccount } from '../auth/next-route';
import { flush, isTracking, onTrackingStopped, startTracking, stopTracking } from '../sharing/tracking';
import { REQUEST_KEY, passengerCadence, useCurrentRequest } from './useRequest';

/**
 * Keeps the passenger's location service in line with the server (R-032, R-038), from any screen:
 * an OPEN request without the service (the app was reopened) restarts it, so the server can apply its
 * rules; no open request → the service is stopped.
 */
export function RequestSupervisor() {
  const { session } = useAuth();
  const passenger = session.status === 'signedIn' && !isDriverAccount(session.me.driverVerification);
  return passenger ? <Supervisor /> : null;
}

function Supervisor() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const current = useCurrentRequest();
  const open = current.data?.request?.status === 'OPEN';
  const tracking = current.data?.tracking;

  useEffect(() => {
    void (async () => {
      if (open && tracking) {
        const { granted } = await Location.getForegroundPermissionsAsync();
        if (granted && !(await isTracking())) {
          await startTracking(passengerCadence(tracking), {
            title: t('requests.notificationTitle'),
            body: t('requests.notificationBody'),
          }).catch(() => undefined);
        }
        void flush();
      } else if (current.isSuccess && (await isTracking())) {
        await stopTracking();
      }
    })();
  }, [open, tracking, current.isSuccess, t]);

  useEffect(() => {
    const unsubscribe = onTrackingStopped(
      () => void queryClient.invalidateQueries({ queryKey: REQUEST_KEY }),
    );
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void queryClient.invalidateQueries({ queryKey: REQUEST_KEY });
        void flush();
      }
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [queryClient]);

  return null;
}
