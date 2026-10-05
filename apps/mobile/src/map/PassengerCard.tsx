import type { ExactPassenger } from '@fi-thnitek/contracts';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { langOf } from '../places/format';
import { distanceParts } from '../places/format';
import { colors, elevation, radii, spacing } from '../theme/tokens';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Badge, Banner, IconButton } from '../ui/kit';
import { SafetyActions } from '../safety/SafetyActions';
import { Text } from '../ui/Text';
import { openNavigation } from './navigate';
import { arrow } from '../ui/arrow';

/**
 * Stitch "Anonymous / Identified Passenger Details": destination, seats, wait, distance, the name and note
 * only when the passenger chose to show them, a warning when other drivers are closer, and Navigate.
 */
export function PassengerCard({ passenger: p, onClose }: { passenger: ExactPassenger; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const d = distanceParts(p.distanceM);
  const dest = p.destination
    ? lang === 'ar'
      ? p.destination.nameAr
      : p.destination.nameFr
    : t('places.pinnedPoint');

  return (
    <View style={[styles.card, elevation]} accessibilityLiveRegion="polite">
      <View style={styles.grabber} />
      <View style={styles.row}>
        <View style={styles.avatar}>
          {p.name ? (
            <Text variant="headline" style={styles.initial}>
              {p.name.trim().charAt(0).toUpperCase()}
            </Text>
          ) : (
            <Icon name="incognito" color={colors.onPrimary} />
          )}
        </View>
        <View style={styles.flex}>
          <Text variant="headline">{p.name ?? t('passenger.anonymous')}</Text>
          <Text variant="caption" muted>
            {arrow()} {dest}
          </Text>
        </View>
        <IconButton icon="close" label={t('live.close')} variant="tonal" onPress={onClose} />
      </View>

      <View style={styles.badges}>
        <Badge label={`${p.seats} ${t('driver.seats')}`} icon="seat-passenger" />
        <Badge
          label={t('passenger.waiting', { minutes: p.waitingMin })}
          icon="clock-outline"
          tone="warning"
        />
        <Badge label={t(`places.${d.unit}`, { value: d.value })} icon="map-marker-distance" tone="success" />
      </View>

      {p.note ? (
        <View style={styles.note}>
          <Icon name="format-quote-open" size={20} color={colors.primary} />
          <Text style={styles.flex}>{p.note}</Text>
        </View>
      ) : null}

      {p.closerDrivers > 0 ? (
        <Banner icon="alert-outline" tone="danger">
          {t('passenger.closerDrivers', { count: p.closerDrivers })}
        </Banner>
      ) : null}

      <Button
        label={t('passenger.navigate')}
        icon="navigation-variant"
        onPress={() => void openNavigation('google', p.lat, p.lng)}
      />
      <Button
        label={t('passenger.waze')}
        icon="waze"
        variant="tonal"
        onPress={() => void openNavigation('waze', p.lat, p.lng)}
      />
      <SafetyActions target={{ source: 'PASSENGER_MARKER', requestId: p.id }} onBlocked={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  initial: { color: colors.onPrimary },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
});
