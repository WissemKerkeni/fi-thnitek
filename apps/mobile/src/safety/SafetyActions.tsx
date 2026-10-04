import type { MarkerRef } from '@fi-thnitek/contracts';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { safetyErrorMessage, useBlock } from './useSafety';

/**
 * R-070 / R-071 on a marker card: "Report" opens the report form; "Block" asks first, then hides both
 * people from each other's map and closes the card.
 */
export function SafetyActions({ target, onBlocked }: { target: MarkerRef; onBlocked: () => void }) {
  const { t } = useTranslation();
  const block = useBlock();
  const id = target.source === 'DRIVER_MARKER' ? target.sessionId : target.requestId;

  function confirmBlock() {
    Alert.alert(t('safety.blockConfirmTitle'), t('safety.blockConfirm'), [
      { text: t('requests.keep'), style: 'cancel' },
      {
        text: t('safety.block'),
        style: 'destructive',
        onPress: () =>
          block.mutate(target, {
            onSuccess: () => {
              onBlocked();
              Alert.alert(t('safety.block'), t('safety.blocked'));
            },
            onError: (error) => Alert.alert(t('safety.block'), safetyErrorMessage(t, error)),
          }),
      },
    ]);
  }

  return (
    <View style={styles.row}>
      <Action
        icon="flag-outline"
        label={t('safety.report')}
        onPress={() => router.push({ pathname: '/report', params: { source: target.source, id } })}
      />
      <Action icon="account-cancel-outline" label={t('safety.block')} onPress={confirmBlock} />
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Icon name={icon} size={18} color={colors.danger} />
      <Text variant="label" style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  label: { color: colors.danger },
});
