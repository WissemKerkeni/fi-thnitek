import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { isDriverAccount } from '../src/auth/next-route';
import { colors, radii, spacing } from '../src/theme/tokens';
import { Icon } from '../src/ui/Icon';
import { Badge, Banner, Card, ListRow, SectionTitle } from '../src/ui/kit';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

/** Tunisian emergency numbers (shown on the Stitch "Profile" screen). */
const EMERGENCY = [
  { key: 'police', number: '197', icon: 'police-badge-outline' },
  { key: 'nationalGuard', number: '193', icon: 'shield-account-outline' },
  { key: 'civilProtection', number: '198', icon: 'fire-truck' },
  { key: 'samu', number: '190', icon: 'ambulance' },
] as const;

/** P6 / D6 "Me" (Stitch "Profile"): identity card, driver file, language, emergency numbers, sign out, delete (R-005). */
export default function MeScreen() {
  const { t } = useTranslation();
  const { session, signOut, deleteAccount } = useAuth();
  const me = session.status === 'signedIn' ? session.me : null;
  const driver = isDriverAccount(me?.driverVerification);

  function confirmDelete() {
    Alert.alert(t('me.deleteConfirmTitle'), t('me.deleteConfirmBody'), [
      { text: t('me.cancel'), style: 'cancel' },
      {
        text: t('me.confirmDelete'),
        style: 'destructive',
        onPress: () => void deleteAccount().then(() => router.replace('/')),
      },
    ]);
  }

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
            {driver ? (
              <Badge label={t(`driver.status_${me.driverVerification!}`)} tone="success" icon="steering" />
            ) : (
              <Badge label={t('me.passenger')} icon="account" />
            )}
          </View>
        </Card>
      ) : null}

      {me && !driver ? <Banner icon="incognito">{t('me.privacyNote')}</Banner> : null}

      {me && !me.driverVerification ? (
        <View style={styles.cta}>
          <Icon name="steering" size={32} color={colors.accent} />
          <Text variant="bodyStrong" style={[styles.flex, styles.ctaText]}>
            {t('me.driverCta')}
          </Text>
          <View>
            <Button label={t('me.driverCtaAction')} variant="accent" onPress={() => router.push('/driver')} />
          </View>
        </View>
      ) : null}

      <View style={styles.group}>
        {driver ? (
          <ListRow icon="access-point" title={t('sharing.title')} onPress={() => router.push('/sharing')} />
        ) : null}
        {driver ? (
          <ListRow
            icon="calendar-clock"
            title={t('routines.title')}
            onPress={() => router.push('/routines')}
          />
        ) : null}
        {me?.driverVerification ? (
          <ListRow icon="steering" title={t('driver.statusTitle')} onPress={() => router.push('/driver')} />
        ) : null}
        <ListRow icon="translate" title={t('language.title')} onPress={() => router.push('/language')} />
      </View>

      <Card>
        <SectionTitle icon="phone-alert-outline" title={t('me.emergency')} />
        <View style={styles.grid}>
          {EMERGENCY.map((e) => (
            <Pressable
              key={e.key}
              accessibilityRole="button"
              accessibilityLabel={`${t(`me.${e.key}`)} ${e.number}`}
              onPress={() => void Linking.openURL(`tel:${e.number}`)}
              style={({ pressed }) => [styles.emergency, pressed && styles.pressed]}
            >
              <Icon name={e.icon} color={colors.danger} />
              <Text variant="title" style={styles.number}>
                {e.number}
              </Text>
              <Text variant="caption" muted style={styles.center}>
                {t(`me.${e.key}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <View style={styles.group}>
        <ListRow
          icon="logout"
          title={t('me.signOut')}
          onPress={() => void signOut().then(() => router.replace('/'))}
        />
        <ListRow
          icon="delete-outline"
          title={t('me.deleteAccount')}
          onPress={confirmDelete}
          trailing={<Icon name="alert-outline" color={colors.danger} />}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: spacing.xs },
  center: { textAlign: 'center' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
  },
  ctaText: { color: colors.onPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  emergency: {
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.dangerContainer,
  },
  number: { color: colors.danger },
  pressed: { opacity: 0.85 },
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
});
