import type { FinderDeparture, FinderDriver } from '@fi-thnitek/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Stack, router, useIsFocused } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { myPosition } from '../src/location/myPosition';
import { mapCenter } from '../src/map/mapCenter';
import { VehicleBadge } from '../src/map/VehicleBadge';
import { useDestination } from '../src/places/destination';
import { distanceParts, langOf, placeNames } from '../src/places/format';
import { useCurrentRequest } from '../src/requests/useRequest';
import { shortDate, tunisParts } from '../src/routines/format';
import { colors, radii, spacing } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
import { Icon, type IconName } from '../src/ui/Icon';
import { Badge, Banner, Card, SectionTitle } from '../src/ui/kit';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';
import { arrow } from '../src/ui/arrow';

/** P2 (Stitch "Tunis → Sousse", R-045/R-046): heading there now, taxis nearby, scheduled departures. */
export default function FinderScreen() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const { api } = useAuth();
  const destination = useDestination();
  const focused = useIsFocused();
  const current = useCurrentRequest();
  const name = destination?.place ? placeNames(destination.place, lang).name : t('places.pinnedPoint');

  const finder = useQuery({
    queryKey: ['finder', destination?.point.lat, destination?.point.lng, destination?.place?.id],
    queryFn: () =>
      api.finder({
        destination: { point: destination!.point, placeId: destination!.place?.id ?? null },
        // R-045: around the passenger (ADR-224), else where the map was looking.
        near: myPosition() ?? mapCenter(),
      }),
    enabled: destination !== null && focused,
    refetchInterval: 5_000,
    placeholderData: keepPreviousData,
  });

  if (!destination) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('places.searchTitle') }} />
        <Button
          label={t('requests.chooseDestination')}
          icon="magnify"
          onPress={() => router.replace('/destination')}
        />
      </Screen>
    );
  }

  const data = finder.data;
  return (
    <Screen>
      <Stack.Screen options={{ title: t('finder.title', { name }) }} />
      {!data ? (
        finder.isError ? (
          <Banner icon="wifi-off" tone="danger">
            {t('common.error')}
          </Banner>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )
      ) : (
        <>
          <Section icon="road-variant" title={t('finder.headingThere')} count={data.headingThere.length}>
            {data.headingThere.map((d) => (
              <DriverRow key={d.id} driver={d} />
            ))}
          </Section>
          <Section icon="taxi" title={t('finder.taxisNearby')} count={data.taxisNearby.length}>
            {data.taxisNearby.map((d) => (
              <DriverRow key={d.id} driver={d} />
            ))}
          </Section>
          <Section icon="calendar-clock" title={t('finder.scheduled')} count={data.scheduled.length}>
            {data.scheduled.map((r) => (
              <DepartureRow key={`${r.routineId}-${r.at}`} departure={r} />
            ))}
          </Section>
          <Text variant="caption" muted style={styles.center}>
            {t('finder.hint')}
          </Text>
        </>
      )}

      {current.data?.request ? (
        <Button
          label={t('requests.activeTitle')}
          icon="bullhorn-outline"
          variant="tonal"
          onPress={() => router.push('/request')}
        />
      ) : (
        <Button
          label={t('requests.ask')}
          subtitle={t('requests.askSubtitle')}
          icon="hail"
          onPress={() => router.push('/request/new')}
        />
      )}
    </Screen>
  );
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: IconName;
  title: string;
  count: number;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <SectionTitle
        icon={icon}
        title={title}
        action={<Badge label={String(count)} tone={count > 0 ? 'success' : 'info'} />}
      />
      {count === 0 ? <Text muted>{t('finder.none')}</Text> : children}
    </Card>
  );
}

function DriverRow({ driver: d }: { driver: FinderDriver }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const distance = d.distanceM !== null ? distanceParts(d.distanceM) : null;
  return (
    <View style={[styles.row, (d.isFull || d.onBreak) && styles.full]}>
      <VehicleBadge type={d.type} size={40} />
      <View style={styles.flex}>
        <Text variant="bodyStrong">
          {d.name}
          {d.lineLabel ? ` · ${d.lineLabel}` : ''}
        </Text>
        <Text variant="caption" muted>
          {d.headingTo ? `${arrow()} ${lang === 'ar' ? d.headingTo.nameAr : d.headingTo.nameFr} · ` : ''}
          {distance
            ? t('finder.distance', { distance: t(`places.${distance.unit}`, { value: distance.value }) })
            : t('finder.noDistance')}
        </Text>
        <Text variant="caption" muted>
          {d.plateDisplay}
        </Text>
      </View>
      {d.onBreak ? (
        <Badge label={t('live.onBreak')} tone="warning" icon="coffee" />
      ) : d.isFull ? (
        <Badge label={t('sharing.fullBadge')} tone="danger" icon="account-cancel" />
      ) : null}
    </View>
  );
}

function DepartureRow({ departure: r }: { departure: FinderDeparture }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const when = tunisParts(r.at);
  return (
    <View style={styles.row}>
      <View style={styles.time}>
        <Text variant="headline" style={styles.timeText}>
          {when.time}
        </Text>
        <Text variant="caption" muted>
          {shortDate(when.date)}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong">
          {lang === 'ar' ? r.from.nameAr : r.from.nameFr} {arrow()}{' '}
          {lang === 'ar' ? r.to.nameAr : r.to.nameFr}
        </Text>
        <Text variant="caption" muted>
          {r.driverName} · {t(`driver.type_${r.type}`)}
          {r.seats ? ` · ${t('routines.seats', { count: r.seats })}` : ''}
        </Text>
        {r.note ? (
          <Text variant="caption" muted>
            “{r.note}”
          </Text>
        ) : null}
      </View>
      <Icon name="calendar-check" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
  full: { opacity: 0.6 },
  time: { alignItems: 'center', minWidth: 56 },
  timeText: { color: colors.primary },
});
