import { DisplayName } from '@fi-thnitek/contracts';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { colors, radii, sizes, spacing, typography } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

/** First-run step 4 (R-002): display name, validated with the same contract as the API. */
export default function NameScreen() {
  const { t } = useTranslation();
  const { updateMe } = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = DisplayName.safeParse(name);
    if (!parsed.success) return setError(t('onboarding.nameInvalid'));
    setBusy(true);
    setError(null);
    try {
      await updateMe({ displayName: parsed.data });
      router.replace('/');
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('onboarding.nameTitle') }} />
      <Text muted>{t('onboarding.nameHint')}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('onboarding.namePlaceholder')}
        placeholderTextColor={colors.textMuted}
        autoComplete="given-name"
        textContentType="givenName"
        maxLength={40}
        style={styles.input}
        accessibilityLabel={t('onboarding.nameTitle')}
        onSubmitEditing={() => void save()}
        returnKeyType="done"
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button label={t('common.continue')} onPress={() => void save()} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    ...typography.body,
    minHeight: sizes.minTouchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
    textAlign: 'auto',
  },
  error: { color: colors.danger },
});
