import type { MapDriver } from '@fi-thnitek/contracts';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { langOf } from '../places/format';
import { shortDate, tunisParts } from '../routines/format';
import { clockTime } from '../sharing/time';
import { colors, elevation, radii, spacing } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { Badge, IconButton } from '../ui/kit';
import { SafetyActions } from '../safety/SafetyActions';
import { Text } from '../ui/Text';
import { VehicleBadge } from './VehicleBadge';

/** The tapped driver (R-022): name, type, plate, heading to, bus line, last update. */
export function DriverCard({ driver, onClose }: { driver: MapDriver; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const updated =
    driver.updatedAgoS < 60
      ? t('live.updatedSeconds', { value: driver.updatedAgoS })
      : t('live.updatedMinutes', { value: Math.round(driver.updatedAgoS / 60) });
  return (
    <View style={[styles.card, elevation]} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <VehicleBadge type={driver.type} size={44} />
        <View style={styles.flex}>
          <Text variant="headline">{driver.name}</Text>
          <Text variant="caption" muted>
            {t(`driver.type_${driver.type}`)} · {driver.plateDisplay}
          </Text>
        </View>
        <IconButton icon="close" label={t('live.close')} variant="tonal" onPress={onClose} />
      </View>
      <View style={styles.badges}>
        {driver.onBreak ? (
          <Badge
            label={
              driver.breakUntil
                ? t('live.onBreakUntil', { time: clockTime(driver.breakUntil, lang) })
                : t('live.onBreak')
            }
            tone="warning"
            icon="coffee"
          />
        ) : driver.isFull ? (
          <Badge label={t('sharing.fullBadge')} tone="danger" icon="account-cancel" />
        ) : null}
        {driver.lineLabel ? (
          <Badge label={t('live.line', { line: driver.lineLabel })} icon="bus-stop" />
        ) : null}
        <Badge label={updated} tone="success" icon="access-point" />
      </View>
      {driver.nextRoutine ? (
        <View style={styles.heading}>
          <Icon name="calendar-clock" size={20} color={colors.primary} />
          <Text style={styles.flex}>
            {t('live.nextRoutine', {
              name: lang === 'ar' ? driver.nextRoutine.toNameAr : driver.nextRoutine.toNameFr,
              when: `${shortDate(tunisParts(driver.nextRoutine.at).date)} ${tunisParts(driver.nextRoutine.at).time}`,
            })}
          </Text>
        </View>
      ) : null}
      {driver.headingTo ? (
        <View style={styles.heading}>
          <Icon name="map-marker" size={20} color={colors.danger} />
          <Text variant="bodyStrong" style={styles.flex}>
            {t('live.headingTo', {
              name: lang === 'ar' ? driver.headingTo.nameAr : driver.headingTo.nameFr,
            })}
          </Text>
        </View>
      ) : null}
      <SafetyActions target={{ source: 'DRIVER_MARKER', sessionId: driver.id }} onBlocked={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
});
