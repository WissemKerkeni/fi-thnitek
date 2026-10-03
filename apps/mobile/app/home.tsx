import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { api } from '../src/lib/query';
import { colors, radii, spacing } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

/** Placeholder home until the map home (P1) arrives: health, map, language and account (R-005). */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { session, signOut, deleteAccount } = useAuth();
  const name = session.status === 'signedIn' ? session.me.displayName : null;

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

  const health = useQuery({ queryKey: ['health'], queryFn: () => api.getHealth() });

  const up = health.data?.status === 'up';
  const statusText = health.isPending
    ? t('health.checking')
    : health.isError
      ? t('common.error')
      : up
        ? t('health.up')
        : t('health.down');

  return (
    <Screen>
      <Stack.Screen options={{ title: t('app.name') }} />
      {name ? <Text variant="title">{t('me.greeting', { name })}</Text> : null}
      <View style={styles.card} accessibilityRole="summary">
        <Text variant="bodyStrong">{t('health.title')}</Text>
        <View style={styles.row}>
          {/* Shape + colour: state is never conveyed by colour alone (docs/ux.md §4). */}
          <View
            style={[styles.badge, { backgroundColor: up ? colors.success : colors.danger }]}
            accessibilityElementsHidden
          >
            <Text style={styles.badgeText}>{up ? '✓' : '!'}</Text>
          </View>
          <Text>{statusText}</Text>
        </View>
        {health.data ? (
          <>
            <Text muted>
              {t('health.database')}: {health.data.checks.database}
            </Text>
            <Text muted>
              {t('health.version')}: {health.data.version}
            </Text>
          </>
        ) : null}
      </View>
      <Button
        label={t('common.retry')}
        variant="secondary"
        onPress={() => void health.refetch()}
        loading={health.isFetching}
      />
      <Button label={t('map.title')} onPress={() => router.push('/map')} />
      <Button
        label={
          session.status === 'signedIn' && session.me.driverVerification
            ? t('driver.statusTitle')
            : t('driver.entry')
        }
        variant="accent"
        onPress={() => router.push('/driver')}
        accessibilityHint={t('driver.entryHint')}
      />
      <Button label={t('language.title')} variant="secondary" onPress={() => router.push('/language')} />
      <Button
        label={t('me.signOut')}
        variant="secondary"
        onPress={() => void signOut().then(() => router.replace('/'))}
      />
      <Button label={t('me.deleteAccount')} variant="secondary" onPress={confirmDelete} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { width: 28, height: 28, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.onStatus, fontWeight: '700' },
});
