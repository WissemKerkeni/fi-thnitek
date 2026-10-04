import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { ApiError } from '../src/lib/api';
import { colors, spacing } from '../src/theme/tokens';
import { AppLogo } from '../src/ui/AppHeader';
import { Button } from '../src/ui/Button';
import { Banner } from '../src/ui/kit';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

/** First-run step 1 (R-001): Google sign-in. */
export default function SignInScreen() {
  const { t } = useTranslation();
  const { signIn, endedReason } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountMessage = (code: string | null | undefined) =>
    code === 'ACCOUNT_SUSPENDED' ? t('auth.suspended') : code === 'ACCOUNT_BANNED' ? t('auth.banned') : null;

  async function onPress() {
    setBusy(true);
    setError(null);
    try {
      const result = await signIn();
      if (result === 'ok') router.replace('/');
      if (result === 'not-configured') setError(t('auth.notConfigured'));
    } catch (e) {
      const code = e instanceof ApiError ? e.problem?.code : undefined;
      setError(accountMessage(code) ?? t('auth.failed'));
    } finally {
      setBusy(false);
    }
  }

  const message = error ?? accountMessage(endedReason);

  return (
    <Screen topInset>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.hero}>
        <AppLogo size={88} />
        <Text variant="display" style={styles.brand}>
          في ثنيتك
        </Text>
        <Text variant="headline" muted>
          Fi thnitek
        </Text>
        <Text variant="title" style={styles.center}>
          {t('auth.title')}
        </Text>
        <Text muted style={styles.center}>
          {t('auth.subtitle')}
        </Text>
      </View>
      {message ? (
        <Banner icon="alert-circle-outline" tone="danger">
          {message}
        </Banner>
      ) : null}
      <Button label={t('auth.google')} icon="google" onPress={() => void onPress()} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  brand: { color: colors.primary },
  center: { textAlign: 'center' },
});
