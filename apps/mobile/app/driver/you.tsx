import { DriverProfileInput, type MyVerification, type TransportType } from '@fi-thnitek/contracts';
import { TRANSPORT_TYPES } from '@fi-thnitek/domain';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { DocumentList } from '../../src/driver/DocumentList';
import { StepHeader } from '../../src/driver/StepHeader';
import { driverErrorMessage } from '../../src/driver/errors';
import { useVerification } from '../../src/driver/useVerification';
import { colors, radii, sizes, spacing } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';
import { TextField } from '../../src/ui/TextField';

/** D1 step 1 "You": legal name, CIN, transport type, then CIN photos and selfie. */
export default function StepYou() {
  const { data: file } = useVerification();
  // The form starts from the saved file, so render it only once that has loaded.
  return file ? <YouForm file={file} /> : null;
}

function YouForm({ file }: { file: MyVerification }) {
  const { t } = useTranslation();
  const { api } = useAuth();
  const { setData, refresh } = useVerification();
  const [firstName, setFirstName] = useState(file.legalFirstName ?? '');
  const [lastName, setLastName] = useState(file.legalLastName ?? '');
  const [cin, setCin] = useState('');
  const [type, setType] = useState<TransportType | null>(file.transportType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The CIN is never sent back in full: re-entering it is only needed to change it.
  const savedProfile = file.transportType !== null;

  async function save(): Promise<boolean> {
    const parsed = DriverProfileInput.safeParse({
      legalFirstName: firstName,
      legalLastName: lastName,
      cin,
      transportType: type,
    });
    if (!parsed.success) {
      setError(t('common.error'));
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      setData(await api.saveDriverProfile(parsed.data));
      setCin('');
      return true;
    } catch (e) {
      setError(driverErrorMessage(t, e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (!savedProfile || cin) {
      if (!(await save())) return;
    }
    router.push('/driver/licences');
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('driver.title') }} />
      <StepHeader step={1} />
      <TextField
        label={t('driver.legalFirstName')}
        value={firstName}
        onChangeText={setFirstName}
        autoComplete="given-name"
      />
      <TextField
        label={t('driver.legalLastName')}
        value={lastName}
        onChangeText={setLastName}
        autoComplete="family-name"
      />
      <TextField
        label={t('driver.cin')}
        value={cin}
        onChangeText={(v) => setCin(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        maxLength={8}
        placeholder={file.cinLast4 ? `••••${file.cinLast4}` : '01234567'}
        secureTextEntry={false}
      />
      <Text muted>{t('driver.transportType')}</Text>
      <View style={styles.chips}>
        {TRANSPORT_TYPES.map((tt) => (
          <Pressable
            key={tt}
            onPress={() => setType(tt)}
            accessibilityRole="radio"
            accessibilityState={{ checked: type === tt }}
            style={[styles.chip, type === tt && styles.chipOn]}
          >
            <Text style={type === tt ? styles.chipTextOn : undefined}>{t(`driver.type_${tt}`)}</Text>
          </Pressable>
        ))}
      </View>
      <Text muted>{t('driver.publicNameNote')}</Text>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {savedProfile ? (
        <DocumentList
          file={file}
          types={['CIN_FRONT', 'CIN_BACK', 'SELFIE']}
          onUploaded={() => void refresh()}
        />
      ) : (
        <Button label={t('driver.save')} onPress={() => void save()} loading={busy} />
      )}
      <Button
        label={t('driver.next')}
        onPress={() => void next()}
        loading={busy}
        disabled={!savedProfile && !cin}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    minHeight: sizes.minTouchTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTextOn: { color: colors.onPrimary, fontWeight: '700' },
  error: { color: colors.danger },
});
