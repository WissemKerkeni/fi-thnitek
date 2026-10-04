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
import { VehicleBadge } from '../../src/map/VehicleBadge';
import { colors, radii, sizes, spacing } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { Banner, Card, SectionTitle } from '../../src/ui/kit';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';
import { TextField } from '../../src/ui/TextField';

/** D1 step 1 "You": legal name, CIN, transport type, then the CIN photos (no selfie, ADR-216). */
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
      <Card>
        <SectionTitle icon="account-outline" title={t('driver.stepYou')} />
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
      </Card>
      <Card>
        <SectionTitle icon="car-outline" title={t('driver.transportType')} />
        <View style={styles.tiles} accessibilityRole="radiogroup">
          {TRANSPORT_TYPES.map((tt) => {
            const on = type === tt;
            return (
              <Pressable
                key={tt}
                onPress={() => setType(tt)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.tile, on && styles.tileOn]}
              >
                <VehicleBadge type={tt} size={40} />
                <Text variant="label" style={on ? styles.tileTextOn : undefined}>
                  {t(`driver.type_${tt}`)}
                </Text>
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Icon name="check" size={16} color={colors.onPrimary} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>
      <Banner icon="account-eye-outline">{t('driver.publicNameNote')}</Banner>
      {error ? (
        <Banner icon="alert-circle-outline" tone="danger">
          {error}
        </Banner>
      ) : null}
      {savedProfile ? (
        <DocumentList file={file} types={['CIN_FRONT', 'CIN_BACK']} onUploaded={() => void refresh()} />
      ) : (
        <Button
          icon="content-save-outline"
          variant="tonal"
          label={t('driver.save')}
          onPress={() => void save()}
          loading={busy}
        />
      )}
      <Button
        icon="arrow-right"
        label={t('driver.next')}
        onPress={() => void next()}
        loading={busy}
        disabled={!savedProfile && !cin}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: sizes.minTouchTarget,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileOn: { borderColor: colors.primary, backgroundColor: colors.primaryContainer },
  tileTextOn: { color: colors.primary },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { borderColor: colors.primary, backgroundColor: colors.primary },
});
