import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { StepHeader } from '../../src/driver/StepHeader';
import { driverErrorMessage } from '../../src/driver/errors';
import { useVerification } from '../../src/driver/useVerification';
import { colors, radii, spacing } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';

/** D1 step 4 "Review": summary, what is missing, submit (R-061). */
export default function StepReview() {
  const { t } = useTranslation();
  const { api, refreshMe } = useAuth();
  const { data: file, setData } = useVerification();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!file) return null;
  const complete = file.missingDocuments.length === 0 && file.vehicle !== null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      setData(await api.submitVerification());
      await refreshMe();
      router.replace('/driver/status');
    } catch (e) {
      setError(driverErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('driver.title') }} />
      <StepHeader step={4} />
      <View style={styles.card}>
        <Text variant="bodyStrong">
          {file.legalFirstName} {file.legalLastName}
        </Text>
        {file.transportType ? <Text>{t(`driver.type_${file.transportType}`)}</Text> : null}
        {file.cinLast4 ? <Text muted>CIN ••••{file.cinLast4}</Text> : null}
        {file.vehicle ? (
          <Text>
            {file.vehicle.plateDisplay} · {file.vehicle.model} · {file.vehicle.color} · {file.vehicle.seats}
          </Text>
        ) : null}
      </View>
      {complete ? (
        <Text style={styles.ok}>✓ {t('driver.complete')}</Text>
      ) : (
        <View style={styles.card}>
          <Text variant="bodyStrong">{t('driver.missing')}</Text>
          {file.vehicle === null ? <Text>• {t('driver.stepVehicle')}</Text> : null}
          {file.missingDocuments.map((type) => (
            <Text key={type}>• {t(`driver.docType_${type}`)}</Text>
          ))}
        </View>
      )}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button label={t('driver.submit')} onPress={() => void submit()} loading={busy} disabled={!complete} />
      <Button label={t('driver.back')} variant="secondary" onPress={() => router.back()} />
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
    gap: spacing.xs,
  },
  ok: { color: colors.success, fontWeight: '700' },
  error: { color: colors.danger },
});
