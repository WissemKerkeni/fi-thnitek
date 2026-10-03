import { type MyVerification, VehicleInput } from '@fi-thnitek/contracts';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { DocumentList } from '../../src/driver/DocumentList';
import { StepHeader } from '../../src/driver/StepHeader';
import { driverErrorMessage } from '../../src/driver/errors';
import { useVerification } from '../../src/driver/useVerification';
import { colors } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';
import { TextField } from '../../src/ui/TextField';

/** D1 step 3 "Vehicle": plate, model, colour, seats, then the vehicle documents. */
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
  const [model, setModel] = useState(file.vehicle?.model ?? '');
  const [color, setColor] = useState(file.vehicle?.color ?? '');
  const [seats, setSeats] = useState(file.vehicle ? String(file.vehicle.seats) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveVehicle(): Promise<boolean> {
    const parsed = VehicleInput.safeParse({ plate, model, color, seats: Number(seats) });
    if (!parsed.success) {
      setError(t('common.error'));
      return false;
    }
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
      <TextField
        label={t('driver.plate')}
        value={plate}
        onChangeText={setPlate}
        placeholder={t('driver.platePlaceholder')}
      />
      <TextField label={t('driver.model')} value={model} onChangeText={setModel} />
      <TextField label={t('driver.color')} value={color} onChangeText={setColor} />
      <TextField
        label={t('driver.seats')}
        value={seats}
        onChangeText={(v) => setSeats(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        maxLength={2}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {file.vehicle ? null : (
        <Button label={t('driver.save')} onPress={() => void saveVehicle()} loading={busy} />
      )}
      {file.vehicle ? (
        <DocumentList
          file={file}
          types={['VEHICLE_REGISTRATION', 'INSURANCE', 'OPERATING_CARD', 'VEHICLE_PHOTO']}
          onUploaded={() => void refresh()}
        />
      ) : null}
      <Button label={t('driver.next')} onPress={() => void next()} loading={busy} />
      <Button label={t('driver.back')} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({ error: { color: colors.danger } });
