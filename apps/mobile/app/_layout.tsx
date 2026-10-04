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
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/auth/AuthProvider';
import { usePushRegistration } from '../src/push/usePushRegistration';
import { initI18n } from '../src/i18n';
import { queryClient } from '../src/lib/query';
import { SharingSupervisor } from '../src/sharing/SharingSupervisor';
import { colors } from '../src/theme/tokens';
import { StackHeader } from '../src/ui/AppHeader';

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
          <SharingSupervisor />
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

function PushRegistration() {
  usePushRegistration();
  return null;
}
