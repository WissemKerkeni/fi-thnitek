import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { isDriverAccount } from '../src/auth/next-route';
import { colors, radii, sizes, spacing } from '../src/theme/tokens';
import { Icon } from '../src/ui/Icon';
import { Badge, Card, ListRow } from '../src/ui/kit';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

/** Tunisian emergency numbers (R-072), one compact row. */
const EMERGENCY = [
  { key: 'police', number: '197' },
  { key: 'nationalGuard', number: '193' },
  { key: 'civilProtection', number: '198' },
  { key: 'samu', number: '190' },
] as const;

/**
 * P6 / D6 "Me": identity, the person's own lists, language, emergency numbers, sign out. A passenger
 * account never sees the driver sign-up (ADR-225: the role is chosen once at first run); deleting the
 * account lives one level down, on the Account screen.
 */
export default function MeScreen() {
  const { t } = useTranslation();
  const { session, signOut } = useAuth();
  const me = session.status === 'signedIn' ? session.me : null;
  const driverRole = me?.role === 'DRIVER';
  const verifiedDriver = isDriverAccount(me?.driverVerification);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('map.me') }} />
      {me ? (
        <Card style={styles.identity}>
          <View style={styles.avatar}>
            <Text variant="title" style={styles.initial}>
              {(me.displayName ?? '?').trim().charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text variant="headline">{me.displayName}</Text>
            {driverRole && me.driverVerification ? (
              <Badge
                label={t(`driver.status_${me.driverVerification}`)}
                tone={verifiedDriver ? 'success' : 'info'}
                icon="steering"
              />
            ) : (
              <Badge label={driverRole ? t('role.driver') : t('me.passenger')} icon="account" />
            )}
            {!driverRole ? (
              <Text variant="caption" muted>
                {t('me.privacyNote')}
              </Text>
            ) : null}
          </View>
        </Card>
      ) : null}

      <View style={styles.group}>
        {verifiedDriver ? (
          <ListRow icon="access-point" title={t('sharing.title')} onPress={() => router.push('/sharing')} />
        ) : null}
        {verifiedDriver ? (
          <ListRow
            icon="calendar-clock"
            title={t('routines.title')}
            onPress={() => router.push('/routines')}
          />
        ) : null}
        {driverRole ? (
          <ListRow icon="steering" title={t('driver.statusTitle')} onPress={() => router.push('/driver')} />
        ) : null}
        {driverRole ? (
          <ListRow
            icon="history"
            title={t('safety.sessionHistory')}
            onPress={() => router.push('/history/sessions')}
          />
        ) : (
          <ListRow
            icon="history"
            title={t('safety.requestHistory')}
            onPress={() => router.push('/history/requests')}
          />
        )}
        <ListRow
          icon="account-cancel-outline"
          title={t('safety.blocksTitle')}
          onPress={() => router.push('/blocks')}
        />
        <ListRow icon="translate" title={t('language.title')} onPress={() => router.push('/language')} />
        <ListRow icon="account-cog-outline" title={t('me.account')} onPress={() => router.push('/account')} />
      </View>

      <View style={styles.emergencyRow} accessibilityRole="summary" accessibilityLabel={t('me.emergency')}>
        <Icon name="phone-alert-outline" size={20} color={colors.danger} />
        {EMERGENCY.map((e) => (
          <Pressable
            key={e.key}
            accessibilityRole="button"
            accessibilityLabel={`${t(`me.${e.key}`)} ${e.number}`}
            onPress={() => void Linking.openURL(`tel:${e.number}`)}
            style={({ pressed }) => [styles.emergency, pressed && styles.pressed]}
          >
            <Text variant="label" style={styles.number}>
              {e.number}
            </Text>
            <Text variant="caption" muted numberOfLines={1}>
              {t(`me.${e.key}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.group}>
        <ListRow
          icon="logout"
          title={t('me.signOut')}
          onPress={() => void signOut().then(() => router.replace('/'))}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: spacing.xs },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  initial: { color: colors.onPrimary },
  group: {
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  emergencyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  emergency: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.minTouchTarget,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.dangerContainer,
  },
  number: { color: colors.danger },
  pressed: { opacity: 0.85 },
});
