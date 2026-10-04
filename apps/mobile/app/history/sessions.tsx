import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { VehicleBadge } from '../../src/map/VehicleBadge';
import { langOf, placeNames } from '../../src/places/format';
import { shortDate, tunisParts } from '../../src/routines/format';
import { ReportLink } from '../../src/safety/ReportLink';
import { colors, radii, spacing } from '../../src/theme/tokens';
import { Banner, Card } from '../../src/ui/kit';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';

/** R-070: the driver's own sessions of the last 30 days; "Report a problem during this session" + a time. */
export default function SessionHistoryScreen() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const { api } = useAuth();
  const history = useQuery({ queryKey: ['sharing-history'], queryFn: () => api.sharingHistory() });

  return (
    <Screen>
      <Stack.Screen options={{ title: t('safety.sessionHistory') }} />
      <Banner icon="shield-check-outline">{t('safety.historyHint')}</Banner>
      {!history.data ? (
        <ActivityIndicator color={colors.primary} />
      ) : history.data.sessions.length === 0 ? (
        <Text muted style={styles.center}>
          {t('safety.sessionHistoryEmpty')}
        </Text>
      ) : (
        <Card>
          {history.data.sessions.map((s) => {
            const start = tunisParts(s.startedAt);
            const end = s.endedAt ? tunisParts(s.endedAt).time : t('safety.ongoing');
            return (
              <View key={s.id} style={styles.row}>
                <VehicleBadge type={s.transportType} size={36} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong">
                    {shortDate(start.date)} · {start.time} – {end}
                  </Text>
                  {s.headingTo ? (
                    <Text variant="caption" muted>
                      → {placeNames(s.headingTo, lang).name}
                    </Text>
                  ) : null}
                  {s.endReason ? (
                    <Text variant="caption" muted>
                      {t(`sharing.reason_${s.endReason}`)}
                    </Text>
                  ) : null}
                </View>
                <ReportLink
                  onPress={() =>
                    router.push({
                      pathname: '/report',
                      params: {
                        source: 'MY_SESSION',
                        id: s.id,
                        from: s.startedAt,
                        to: s.endedAt ?? new Date().toISOString(),
                      },
                    })
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
});
