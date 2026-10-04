import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { StepHeader } from '../../src/driver/StepHeader';
import { driverErrorMessage } from '../../src/driver/errors';
import { useVerification } from '../../src/driver/useVerification';
import { VehicleBadge } from '../../src/map/VehicleBadge';
import { colors, radii, spacing } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { Banner, Card, SectionTitle } from '../../src/ui/kit';
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
      <Card>
        <SectionTitle icon="clipboard-check-outline" title={t('driver.stepReview')} />
        <View style={styles.row}>
          <Icon name="account-outline" color={colors.primary} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">
              {file.legalFirstName} {file.legalLastName}
            </Text>
            {file.cinLast4 ? (
              <Text variant="caption" muted>
                CIN ••••{file.cinLast4}
              </Text>
            ) : null}
          </View>
        </View>
        {file.transportType ? (
          <View style={styles.row}>
            <VehicleBadge type={file.transportType} size={28} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{t(`driver.type_${file.transportType}`)}</Text>
              {file.vehicle ? (
                <Text variant="caption" muted>
                  {file.vehicle.plateDisplay}
                  {file.vehicle.seats ? ` · ${file.vehicle.seats} ${t('driver.seats')}` : ''}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </Card>
      {complete ? (
        <Banner icon="check-circle-outline" tone="success">
          {t('driver.complete')}
        </Banner>
      ) : (
        <Card>
          <SectionTitle icon="alert-circle-outline" title={t('driver.missing')} />
          {file.vehicle === null ? <MissingRow label={t('driver.stepVehicle')} /> : null}
          {file.missingDocuments.map((type) => (
            <MissingRow key={type} label={t(`driver.docType_${type}`)} />
          ))}
        </Card>
      )}
      {error ? (
        <Banner icon="alert-circle-outline" tone="danger">
          {error}
        </Banner>
      ) : null}
      <Button
        icon="send"
        label={t('driver.submit')}
        onPress={() => void submit()}
        loading={busy}
        disabled={!complete}
      />
      <Button label={t('driver.back')} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

function MissingRow({ label }: { label: string }) {
  return (
    <View style={styles.row}>
      <Icon name="close-circle-outline" size={20} color={colors.danger} />
      <Text style={styles.flex}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
});
