import type { RoutineInput, RoutineView } from '@fi-thnitek/contracts';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';
import { VehicleBadge } from '../../src/map/VehicleBadge';
import { langOf, placeNames } from '../../src/places/format';
import { scheduleSummary, shortDate, tunisParts } from '../../src/routines/format';
import { routineErrorMessage, useRoutineActions, useRoutines } from '../../src/routines/useRoutines';
import { colors, radii, spacing } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { Badge, Banner, Card, IconButton } from '../../src/ui/kit';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';

/** D5 (Stitch "Mes trajets habituels"): up to 5 routines with their next departure and an on/off switch. */
export default function RoutinesScreen() {
  const { t } = useTranslation();
  const routines = useRoutines();
  const list = routines.data;
  const atMax = list ? list.routines.length >= list.max : false;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('routines.title') }} />
      <Banner icon="calendar-clock">{t('routines.hint')}</Banner>
      {!list ? (
        routines.isError ? (
          <Banner icon="wifi-off" tone="danger">
            {t('common.error')}
          </Banner>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )
      ) : list.routines.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="map-marker-path" size={48} color={colors.textMuted} />
          <Text muted>{t('routines.empty')}</Text>
        </View>
      ) : (
        list.routines.map((r) => <RoutineCard key={r.id} routine={r} />)
      )}
      {atMax && list ? (
        <Text variant="caption" muted style={styles.center}>
          {t('routines.limit', { max: list.max })}
        </Text>
      ) : null}
      <Button
        label={t('routines.add')}
        icon="plus"
        disabled={!list || atMax}
        onPress={() => router.push('/routines/edit')}
      />
    </Screen>
  );
}

function RoutineCard({ routine: r }: { routine: RoutineView }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const { save, stillRunning } = useRoutineActions();
  const next = r.nextOccurrences[0];
  const nextLabel = next ? `${shortDate(tunisParts(next).date)} · ${tunisParts(next).time}` : null;

  function toggle(active: boolean) {
    const input: RoutineInput = {
      fromPlaceId: r.from.id,
      toPlaceId: r.to.id,
      schedule: r.schedule,
      seats: r.seats,
      note: r.note,
      active,
    };
    save.mutate({ id: r.id, input });
  }

  return (
    <Card style={!r.active || r.hidden ? styles.dimmed : undefined}>
      {r.stillRunningPending ? (
        <View style={styles.prompt}>
          <Text variant="bodyStrong">{t('routines.stillRunningTitle')}</Text>
          <View style={styles.promptActions}>
            <View style={styles.flex}>
              <Button
                label={t('routines.yes')}
                variant="primary"
                loading={stillRunning.isPending}
                onPress={() => stillRunning.mutate({ id: r.id, running: true })}
              />
            </View>
            <View style={styles.flex}>
              <Button
                label={t('routines.no')}
                variant="secondary"
                disabled={stillRunning.isPending}
                onPress={() => stillRunning.mutate({ id: r.id, running: false })}
              />
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.row}>
        <VehicleBadge type={r.transportType} size={40} />
        <View style={styles.flex}>
          <View style={styles.route}>
            <Text variant="headline" numberOfLines={1} style={styles.shrink}>
              {placeNames(r.from, lang).name}
            </Text>
            <Icon name="arrow-right" size={20} color={colors.primary} />
            <Text variant="headline" numberOfLines={1} style={styles.shrink}>
              {placeNames(r.to, lang).name}
            </Text>
          </View>
          <Text variant="caption" muted>
            {scheduleSummary(r.schedule, t)}
          </Text>
        </View>
        <Switch
          value={r.active && !r.hidden}
          onValueChange={toggle}
          disabled={save.isPending}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors.surface}
          accessibilityLabel={t('routines.active')}
        />
      </View>

      <View style={styles.meta}>
        {nextLabel ? (
          <Badge label={t('routines.next', { when: nextLabel })} tone="success" icon="clock-outline" />
        ) : (
          <Badge label={t('routines.noNext')} icon="clock-outline" />
        )}
        {r.seats ? <Badge label={t('routines.seats', { count: r.seats })} icon="seat-passenger" /> : null}
      </View>
      {r.note ? (
        <Text variant="caption" muted>
          “{r.note}”
        </Text>
      ) : null}
      {r.hidden ? (
        <Banner icon="eye-off-outline" tone="warning">
          {t('routines.hidden')}
        </Banner>
      ) : null}
      {save.isError ? (
        <Banner icon="alert-circle-outline" tone="danger">
          {routineErrorMessage(t, save.error)}
        </Banner>
      ) : null}

      <View style={styles.actions}>
        <IconButton
          icon="pencil"
          label={t('routines.edit')}
          variant="tonal"
          shape="square"
          onPress={() => router.push({ pathname: '/routines/edit', params: { id: r.id } })}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  dimmed: { opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  route: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  prompt: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.warningContainer,
  },
  promptActions: { flexDirection: 'row', gap: spacing.sm },
});
