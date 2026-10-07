// Registers the location task before anything else (Android delivers fixes to it by name).
import '../src/sharing/tracking';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ErrorBoundaryProps, Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/AuthProvider';
import { BEFORE_LOCATION, PASSENGER_ONLY, driverHome } from '../src/auth/next-route';
import { usePushRegistration } from '../src/push/usePushRegistration';
import { initI18n } from '../src/i18n';
import { locationStatus, refreshPosition } from '../src/location/myPosition';
import { flushCrashes, installCrashReporter, recordCrash, setCrashScreen } from '../src/lib/crashReporter';
import { queryClient } from '../src/lib/query';
import { RequestSupervisor } from '../src/requests/RequestSupervisor';
import { SharingSupervisor } from '../src/sharing/SharingSupervisor';
import { colors } from '../src/theme/tokens';
import { StackHeader } from '../src/ui/AppHeader';
import { Button } from '../src/ui/Button';
import { Text } from '../src/ui/Text';

installCrashReporter();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  // A missing font must not block the app: fall back to the system face after an error.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    void initI18n().finally(() => setReady(true));
    // Crashes queued by a previous run go out now, and whenever the app comes back.
    void flushCrashes();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushCrashes();
    });
    return () => sub.remove();
  }, []);

  if (!ready || (!fontsLoaded && !fontError)) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PushRegistration />
          <CrashScreenTracker />
          <LocationGuard />
          <RoleGuard />
          <SharingSupervisor />
          <RequestSupervisor />
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              header: (props) => <StackHeader {...props} />,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * ADR-224: location is required. Each time the app comes back (and on every screen change), a
 * signed-in person without location is sent to the location screen; with it, the position is refreshed.
 */
function LocationGuard() {
  const { session } = useAuth();
  const path = usePathname();
  const signedIn = session.status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    const check = () =>
      void locationStatus().then((s) => {
        if (s === 'ok') void refreshPosition();
        else if (!BEFORE_LOCATION.includes(path)) router.replace('/location');
      });
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [signedIn, path]);
  return null;
}

/** ADR-226: a driver account is sent from any passenger screen to its own (sharing, or its file). */
function RoleGuard() {
  const { session } = useAuth();
  const path = usePathname();
  const me = session.status === 'signedIn' ? session.me : null;
  useEffect(() => {
    if (me?.role === 'DRIVER' && PASSENGER_ONLY.includes(path))
      router.replace(driverHome(me.driverVerification));
  }, [me?.role, me?.driverVerification, path]);
  return null;
}

function CrashScreenTracker() {
  const path = usePathname();
  useEffect(() => setCrashScreen(path), [path]);
  return null;
}

/**
 * Expo Router's error boundary for the whole app: a render error is queued as a crash report and the
 * person can try again instead of facing a blank screen. Plain texts: i18n may be what failed.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    void recordCrash(error, false).then(flushCrashes);
  }, [error]);
  return (
    <View style={styles.crash}>
      <Text variant="title" style={styles.center}>
        حصل مشكل · Un problème est survenu
      </Text>
      <Text muted style={styles.center}>
        Fi thnitek
      </Text>
      <Button label="Réessayer · عاود" icon="refresh" onPress={() => void retry()} />
    </View>
  );
}

const styles = StyleSheet.create({
  crash: { flex: 1, justifyContent: 'center', gap: 16, padding: 24, backgroundColor: colors.background },
  center: { textAlign: 'center' },
});

function PushRegistration() {
  usePushRegistration();
  return null;
}
