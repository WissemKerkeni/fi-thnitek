import { type MyVerification, VehicleInput } from '@fi-thnitek/contracts';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { DocumentList } from '../../src/driver/DocumentList';
import { StepHeader } from '../../src/driver/StepHeader';
import { driverErrorMessage } from '../../src/driver/errors';
import { useVerification } from '../../src/driver/useVerification';
import { VehicleBadge } from '../../src/map/VehicleBadge';
import { colors, radii, spacing, typography } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { Banner, Card, SectionTitle } from '../../src/ui/kit';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';

/**
 * D1 step 3 "Vehicle": only the plate (seats follow the vehicle type: taxi 4, louage 8), then the
 * carte grise and the operating card (ADR-216).
 */
export default function StepVehicle() {
  const { data: file } = useVerification();
  // The form starts from the saved vehicle, so render it only once the file has loaded.
  return file ? <VehicleForm file={file} /> : null;
}

function VehicleForm({ file }: { file: MyVerification }) {
  const { t } = useTranslation();
  const { api } = useAuth();
  const { setData, refresh } = useVerification();
  const [plate, setPlate] = useState(file.vehicle?.plateDisplay ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveVehicle(): Promise<boolean> {
    const parsed = VehicleInput.safeParse({ plate });
    if (!parsed.success) {
      setError(t('common.error'));
      return false;
    }
    if (file.vehicle?.plateDisplay === plate) return true;
    setBusy(true);
    setError(null);
    try {
      setData(await api.saveVehicle(parsed.data));
      return true;
    } catch (e) {
      setError(driverErrorMessage(t, e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (await saveVehicle()) router.push('/driver/review');
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('driver.title') }} />
      <StepHeader step={3} />
      <Card>
        <SectionTitle icon="card-text-outline" title={t('driver.plate')} />
        {/* Styled like a Tunisian plate (Stitch D1): white on dark, "TN" tag. */}
        <View style={styles.plate}>
          <View style={styles.tn}>
            <Text variant="caption" style={styles.tnText}>
              TN
            </Text>
          </View>
          <TextInput
            value={plate}
            onChangeText={setPlate}
            placeholder={t('driver.platePlaceholder')}
            placeholderTextColor="#94A3B8"
            accessibilityLabel={t('driver.plate')}
            autoCapitalize="characters"
            style={styles.plateInput}
          />
        </View>
        {file.transportType ? (
          <View style={styles.seats}>
            <VehicleBadge type={file.transportType} size={32} />
            <Text style={styles.flex}>{t(`driver.type_${file.transportType}`)}</Text>
            {file.vehicle?.seats ? (
              <View style={styles.seatCount}>
                <Icon name="seat-passenger" size={18} color={colors.primary} />
                <Text variant="bodyStrong">{file.vehicle.seats}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>
      {error ? (
        <Banner icon="alert-circle-outline" tone="danger">
          {error}
        </Banner>
      ) : null}
      {file.vehicle ? (
        <DocumentList
          file={file}
          types={['VEHICLE_REGISTRATION', 'OPERATING_CARD']}
          onUploaded={() => void refresh()}
        />
      ) : (
        <Button
          icon="content-save-outline"
          variant="tonal"
          label={t('driver.save')}
          onPress={() => void saveVehicle()}
          loading={busy}
        />
      )}
      <Button icon="arrow-right" label={t('driver.next')} onPress={() => void next()} loading={busy} />
      <Button label={t('driver.back')} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 3,
    borderColor: '#334155',
    backgroundColor: colors.text,
  },
  tn: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.danger },
  tnText: { color: colors.onStatus, fontWeight: '700' },
  plateInput: {
    ...typography.title,
    flex: 1,
    color: colors.onPrimary,
    textAlign: 'center',
    letterSpacing: 2,
  },
  seats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
  seatCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
