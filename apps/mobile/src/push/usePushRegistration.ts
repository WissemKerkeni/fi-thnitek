import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { deviceInfo } from '../auth/device';

/** Push events the API sends (payload: `{ event }` only, no personal data). */
const DRIVER_EVENTS = new Set([
  'VERIFICATION_APPROVED',
  'VERIFICATION_CHANGES_REQUESTED',
  'VERIFICATION_REJECTED',
  'DOCUMENT_EXPIRING',
  'DOCUMENT_EXPIRED',
]);
/** Sharing events open the sharing screen (R-055, R-058). */
const SHARING_EVENTS = new Set(['SHARING_ENDED', 'BREAK_OVER', 'STILL_WORKING']);

Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
});

/**
 * Once signed in: ask for notification permission (Android 13+), send the FCM device token to the API
 * (R-004, R-063) and open the driver status when a verification notification is tapped.
 */
export function usePushRegistration() {
  const { session, api, refreshMe } = useAuth();
  const queryClient = useQueryClient();
  const signedIn = session.status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    void (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Fi thnitek',
            importance: Notifications.AndroidImportance.HIGH,
          });
        }
        const { granted } = await Notifications.requestPermissionsAsync();
        if (!granted) return;
        const token = await Notifications.getDevicePushTokenAsync();
        await api.registerDevice({ ...(await deviceInfo()), pushToken: String(token.data) });
      } catch {
        // No Firebase config in this build, or offline: the in-app status still works.
      }
    })();
  }, [signedIn, api]);

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener(() => {
      void refreshMe().catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ['sharing'] });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      const event = (response.notification.request.content.data as { event?: string } | undefined)?.event;
      if (event && DRIVER_EVENTS.has(event)) router.push('/driver/status');
      if (event && SHARING_EVENTS.has(event)) router.push('/sharing');
    });
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [refreshMe, queryClient]);
}
