import type { MapDriver } from '@fi-thnitek/contracts';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { langOf } from '../places/format';
import { colors, radii, spacing } from '../theme/tokens';
import { Text } from '../ui/Text';
import { TYPE_ICON } from './DriverMarkers';

/** The tapped driver (R-022): name, type, plate, heading to, bus line, last update. */
export function DriverCard({ driver, onClose }: { driver: MapDriver; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const updated =
    driver.updatedAgoS < 60
      ? t('live.updatedSeconds', { value: driver.updatedAgoS })
      : t('live.updatedMinutes', { value: Math.round(driver.updatedAgoS / 60) });
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <Text style={styles.icon}>{TYPE_ICON[driver.type]}</Text>
        <View style={styles.flex}>
          <Text variant="bodyStrong" style={styles.start}>
            {driver.name}
          </Text>
          <Text muted style={styles.start}>
            {t(`driver.type_${driver.type}`)} · {driver.plateDisplay}
          </Text>
        </View>
        {driver.isFull ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('sharing.fullBadge')}</Text>
          </View>
        ) : null}
      </View>
      {driver.headingTo ? (
        <Text style={styles.start}>
          {t('live.headingTo', { name: lang === 'ar' ? driver.headingTo.nameAr : driver.headingTo.nameFr })}
        </Text>
      ) : null}
      {driver.lineLabel ? (
        <Text style={styles.start}>{t('live.line', { line: driver.lineLabel })}</Text>
      ) : null}
      <View style={styles.row}>
        <Text muted style={[styles.flex, styles.start]}>
          {updated}
        </Text>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={spacing.sm} style={styles.close}>
          <Text style={styles.closeText}>{t('live.close')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  start: { textAlign: 'auto' },
  icon: { fontSize: 28 },
  badge: { borderRadius: radii.sm, paddingHorizontal: spacing.sm, backgroundColor: colors.textMuted },
  badgeText: { color: colors.onStatus, fontWeight: '700' },
  close: { minHeight: 32, justifyContent: 'center' },
  closeText: { color: colors.primary, fontWeight: '600' },
});
