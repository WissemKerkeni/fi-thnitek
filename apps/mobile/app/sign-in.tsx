import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { ApiError } from '../src/lib/api';
import { colors, spacing } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
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
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.hero}>
        <Text variant="title" style={styles.brand}>
          {t('app.name')}
        </Text>
        <Text variant="title">{t('auth.title')}</Text>
        <Text muted>{t('auth.subtitle')}</Text>
      </View>
      {message ? (
        <Text style={styles.error} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
      <Button label={t('auth.google')} onPress={() => void onPress()} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: spacing.xl, gap: spacing.sm },
  brand: { color: colors.primary },
  error: { color: colors.danger },
});
