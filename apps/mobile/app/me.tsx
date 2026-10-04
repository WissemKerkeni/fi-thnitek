import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { isDriverAccount } from '../src/auth/next-route';
import { colors, radii, spacing } from '../src/theme/tokens';
import { Icon } from '../src/ui/Icon';
import { Badge, Card, ListRow } from '../src/ui/kit';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

/** P6 / D6 "Me" (Stitch "Profile"): identity card, driver file, language, sign out, delete (R-005). */
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

      <View style={styles.group}>
        {driver ? (
          <ListRow icon="access-point" title={t('sharing.title')} onPress={() => router.push('/sharing')} />
        ) : null}
        <ListRow
          icon="steering"
          title={me?.driverVerification ? t('driver.statusTitle') : t('driver.entry')}
          subtitle={me?.driverVerification ? null : t('driver.entryHint')}
          onPress={() => router.push('/driver')}
        />
        <ListRow icon="translate" title={t('language.title')} onPress={() => router.push('/language')} />
      </View>

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
