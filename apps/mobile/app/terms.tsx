import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { colors, radii, spacing } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
import { Icon, type IconName } from '../src/ui/Icon';
import { Banner, Card } from '../src/ui/kit';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

const POINTS: { key: 'termsLocation' | 'termsAnonymous' | 'termsNoHistory' | 'termsFree'; icon: IconName }[] =
  [
    { key: 'termsLocation', icon: 'map-marker-radius-outline' },
    { key: 'termsAnonymous', icon: 'incognito' },
    { key: 'termsNoHistory', icon: 'history' },
    { key: 'termsFree', icon: 'hand-heart-outline' },
  ];

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
      <Banner icon="file-document-edit-outline" tone="warning">
        {t('onboarding.termsDraft')}
      </Banner>
      <Card>
        {POINTS.map(({ key, icon }) => (
          <View key={key} style={styles.point}>
            <View style={styles.icon}>
              <Icon name={icon} color={colors.primary} />
            </View>
            <Text style={styles.flex}>{t(`onboarding.${key}`)}</Text>
          </View>
        ))}
      </Card>
      {failed ? (
        <Banner icon="alert-circle-outline" tone="danger">
          {t('common.error')}
        </Banner>
      ) : null}
      <Button label={t('onboarding.accept')} icon="check" onPress={() => void accept()} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  point: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceVariant,
  },
});
