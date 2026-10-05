import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';
import { type LocationStatus, refreshPosition, requestLocation } from '../src/location/myPosition';
import { colors, spacing } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
import { Icon } from '../src/ui/Icon';
import { Banner, Card } from '../src/ui/kit';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

const REASONS = ['location.why1', 'location.why2', 'location.why3'] as const;

/**
 * ADR-224: location is required to use the app. Shown after the first-run steps, and again whenever
 * the permission or the phone's location is off. Explains what the app does with it before asking.
 */
export default function LocationScreen() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LocationStatus | null>(null);
  const [busy, setBusy] = useState(false);

  async function allow() {
    setBusy(true);
    try {
      const next = await requestLocation();
      setStatus(next);
      if (next === 'ok') {
        void refreshPosition();
        router.replace('/');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen topInset>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.hero}>
        <View style={styles.badge}>
          <Icon name="crosshairs-gps" size={40} color={colors.onPrimary} />
        </View>
        <Text variant="title" style={styles.center}>
          {t('location.title')}
        </Text>
        <Text muted style={styles.center}>
          {t('location.body')}
        </Text>
      </View>
      <Card>
        {REASONS.map((key) => (
          <View key={key} style={styles.row}>
            <Icon name="check-circle-outline" color={colors.success} />
            <Text style={styles.flex}>{t(key)}</Text>
          </View>
        ))}
      </Card>
      <Banner icon="shield-lock-outline">{t('location.privacy')}</Banner>
      {status === 'services-off' ? (
        <Banner icon="map-marker-off-outline" tone="warning">
          {t('location.servicesOff')}
        </Banner>
      ) : null}
      {status === 'denied' || status === 'blocked' ? (
        <Banner icon="alert-circle-outline" tone="danger">
          {t('location.denied')}
        </Banner>
      ) : null}
      {status === 'blocked' ? (
        <Button
          label={t('location.openSettings')}
          icon="cog-outline"
          onPress={() => void Linking.openSettings()}
        />
      ) : (
        <Button
          label={t('location.allow')}
          icon="crosshairs-gps"
          loading={busy}
          onPress={() => void allow()}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  badge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
