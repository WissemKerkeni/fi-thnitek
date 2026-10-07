import type { AccountRole } from '@fi-thnitek/contracts';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { colors, radii, spacing } from '../src/theme/tokens';
import { Icon, type IconName } from '../src/ui/Icon';
import { Banner } from '../src/ui/kit';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

const ROLES: {
  role: AccountRole;
  icon: IconName;
  title: 'role.passenger' | 'role.driver';
  hint: 'role.passengerHint' | 'role.driverHint';
}[] = [
  { role: 'PASSENGER', icon: 'human-handsup', title: 'role.passenger', hint: 'role.passengerHint' },
  { role: 'DRIVER', icon: 'steering', title: 'role.driver', hint: 'role.driverHint' },
];

/**
 * ADR-225, first run: passenger or driver, chosen once. A passenger account never becomes a driver; a
 * driver account goes to the verification form and never makes requests.
 */
export default function RoleScreen() {
  const { t } = useTranslation();
  const { updateMe } = useAuth();
  const [pending, setPending] = useState<AccountRole | null>(null);

  function choose(role: AccountRole, title: string) {
    Alert.alert(t('role.confirmTitle', { role: title }), t('role.final'), [
      { text: t('me.cancel'), style: 'cancel' },
      {
        text: t('role.confirm'),
        onPress: () => {
          setPending(role);
          void updateMe({ role })
            .then(() => router.replace(role === 'DRIVER' ? '/driver' : '/'))
            .catch(() => Alert.alert(t('role.title'), t('common.error')))
            .finally(() => setPending(null));
        },
      },
    ]);
  }

  return (
    <Screen topInset>
      <Stack.Screen options={{ headerShown: false }} />
      <Text variant="title" style={styles.title}>
        {t('role.title')}
      </Text>
      {ROLES.map(({ role, icon, title, hint }) => (
        <Pressable
          key={role}
          accessibilityRole="button"
          accessibilityState={{ busy: pending === role }}
          disabled={pending !== null}
          onPress={() => choose(role, t(title))}
          style={({ pressed }) => [styles.option, pressed && styles.pressed]}
        >
          <View style={styles.badge}>
            <Icon name={icon} size={32} color={colors.onPrimary} />
          </View>
          <View style={styles.flex}>
            <Text variant="headline">{t(title)}</Text>
            <Text muted>{t(hint)}</Text>
          </View>
          <Icon name="chevron-right" color={colors.textMuted} />
        </Pressable>
      ))}
      <Banner icon="information-outline">{t('role.final')}</Banner>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { textAlign: 'center', paddingVertical: spacing.lg },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.85 },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  flex: { flex: 1, gap: spacing.xs },
});
