import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { api } from '../src/lib/query';
import { colors, radii, spacing } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

/** Phase 1 home: proves the app reaches the API (GET /v1/health) and opens the base map. */
export default function HomeScreen() {
  const { t } = useTranslation();
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
      <Button label={t('language.title')} variant="secondary" onPress={() => router.push('/language')} />
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
