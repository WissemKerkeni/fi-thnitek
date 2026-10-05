import type { ExactPassenger } from '@fi-thnitek/contracts';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { type Lang, distanceParts, langOf } from '../places/format';
import { colors, radii, spacing } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { Badge } from '../ui/kit';
import { Text } from '../ui/Text';

/** docs/architecture.md §5.3: the sharing driver's passengers, grouped by destination, nearest first. */
export function groupByDestination(passengers: readonly ExactPassenger[], lang: Lang) {
  const groups = new Map<string, ExactPassenger[]>();
  for (const p of [...passengers].sort((a, b) => a.distanceM - b.distanceM)) {
    const key = p.destination ? (lang === 'ar' ? p.destination.nameAr : p.destination.nameFr) : '';
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()].map(([destination, items]) => ({ destination, items }));
}

export function PassengerQueue({
  passengers,
  onSelect,
}: {
  passengers: readonly ExactPassenger[];
  onSelect: (p: ExactPassenger) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  if (passengers.length === 0) {
    return (
      <Text muted style={styles.empty}>
        {t('passenger.none')}
      </Text>
    );
  }
  return groupByDestination(passengers, lang).map(({ destination, items }) => (
    <View key={destination} style={styles.group}>
      <View style={styles.groupTitle}>
        <Icon name="map-marker" size={18} color={colors.danger} />
        <Text variant="bodyStrong" style={styles.flex}>
          {destination || t('places.pinnedPoint')}
        </Text>
        <Badge label={String(items.length)} icon="human-handsup" tone="success" />
      </View>
      {items.map((p) => {
        const d = distanceParts(p.distanceM);
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            onPress={() => onSelect(p)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.flex}>
              <Text variant="bodyStrong">
                {p.name ?? t('passenger.anonymous')} · {p.seats} {t('driver.seats')}
              </Text>
              <Text variant="caption" muted>
                {t(`places.${d.unit}`, { value: d.value })} ·{' '}
                {t('passenger.waiting', { minutes: p.waitingMin })}
              </Text>
            </View>
            {p.closerDrivers > 0 ? (
              <Badge label={`+${p.closerDrivers}`} icon="car-multiple" tone="danger" />
            ) : null}
            <Icon name="chevron-right" color={colors.textMuted} />
          </Pressable>
        );
      })}
    </View>
  ));
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { textAlign: 'center', paddingVertical: spacing.md },
  group: { gap: spacing.xs },
  groupTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
  pressed: { opacity: 0.85 },
});
