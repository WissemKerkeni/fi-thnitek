import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { colors, radii, spacing } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

const POINTS = ['termsLocation', 'termsAnonymous', 'termsNoHistory', 'termsFree'] as const;

/** First-run step 3 (R-002). The points mirror docs/security.md; the full legal text comes with v1.0. */
export default function TermsScreen() {
  const { t } = useTranslation();
  const { session, updateMe } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (session.status !== 'signedIn') return null;
  const version = session.me.currentTermsVersion;

  async function accept() {
    setBusy(true);
    setFailed(false);
    try {
      await updateMe({ acceptTermsVersion: version });
      router.replace('/');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('onboarding.termsTitle') }} />
      <Text muted>{t('onboarding.termsDraft')}</Text>
      <View style={styles.card}>
        {POINTS.map((key) => (
          <Text key={key}>• {t(`onboarding.${key}`)}</Text>
        ))}
      </View>
      {failed ? <Text style={styles.error}>{t('common.error')}</Text> : null}
      <Button label={t('onboarding.accept')} onPress={() => void accept()} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  error: { color: colors.danger },
});
