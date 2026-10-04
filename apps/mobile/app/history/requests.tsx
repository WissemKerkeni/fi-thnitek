import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { langOf, placeNames } from '../../src/places/format';
import { shortDate, tunisParts } from '../../src/routines/format';
import { colors, radii, spacing } from '../../src/theme/tokens';
import { Banner, Badge, Card } from '../../src/ui/kit';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';
import { ReportLink } from '../../src/safety/ReportLink';

/** R-042 / R-070: the passenger's own requests of the last 30 days, each with "Report a problem". */
export default function RequestHistoryScreen() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const { api } = useAuth();
  const history = useQuery({ queryKey: ['request-history'], queryFn: () => api.requestHistory() });

  return (
    <Screen>
      <Stack.Screen options={{ title: t('safety.requestHistory') }} />
      <Banner icon="shield-check-outline">{t('safety.historyHint')}</Banner>
      {!history.data ? (
        <ActivityIndicator color={colors.primary} />
      ) : history.data.requests.length === 0 ? (
        <Text muted style={styles.center}>
          {t('safety.requestHistoryEmpty')}
        </Text>
      ) : (
        <Card>
          {history.data.requests.map((r) => {
            const when = tunisParts(r.createdAt);
            return (
              <View key={r.id} style={styles.row}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">
                    → {r.destination ? placeNames(r.destination, lang).name : t('places.pinnedPoint')}
                  </Text>
                  <Text variant="caption" muted>
                    {shortDate(when.date)} · {when.time} ·{' '}
                    {r.types.map((x) => t(`requests.type_${x}`)).join(t('requests.or'))}
                  </Text>
                  <View style={styles.badges}>
                    <Badge
                      label={
                        r.status === 'OPEN' ? t('safety.status_OPEN') : t(`requests.closedTitle_${r.status}`)
                      }
                      tone={r.status === 'OPEN' ? 'success' : 'info'}
                    />
                  </View>
                </View>
                <ReportLink
                  onPress={() =>
                    router.push({ pathname: '/report', params: { source: 'MY_REQUEST', id: r.id } })
                  }
                />
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  center: { textAlign: 'center' },
  badges: { flexDirection: 'row', marginTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
});
