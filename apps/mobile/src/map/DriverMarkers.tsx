import type { MapDriver, TransportType } from '@fi-thnitek/contracts';
import { Marker } from '@maplibre/maplibre-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';
import { Text } from '../ui/Text';

export const TYPE_ICON: Record<TransportType, string> = { TAXI: '🚕', LOUAGE: '🚐', BUS: '🚌' };

/**
 * R-022: every sharing driver as a labelled pin. The name is always shown; "Full" is a text badge, not a
 * colour only (docs/ux.md §4).
 */
export function DriverMarkers({
  drivers,
  onSelect,
}: {
  drivers: readonly MapDriver[];
  onSelect: (driver: MapDriver) => void;
}) {
  const { t } = useTranslation();
  return drivers.map((d) => (
    <Marker key={d.id} id={d.id} lngLat={[d.lng, d.lat]} anchor="bottom">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${d.name}, ${t(`driver.type_${d.type}`)}${d.isFull ? `, ${t('sharing.fullBadge')}` : ''}`}
        onPress={() => onSelect(d)}
        style={styles.wrap}
      >
        <View style={[styles.pill, d.isFull && styles.pillFull]}>
          <Text style={styles.icon}>{TYPE_ICON[d.type]}</Text>
          <Text variant="label" numberOfLines={1} style={styles.name}>
            {d.name}
          </Text>
          {d.lineLabel ? <Text style={styles.line}>{d.lineLabel}</Text> : null}
          {d.isFull ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t('sharing.fullBadge')}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.tip} />
      </Pressable>
    </Marker>
  ));
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 200,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  pillFull: { borderColor: colors.textMuted, opacity: 0.85 },
  icon: { fontSize: 16 },
  name: { flexShrink: 1, color: colors.text },
  line: { color: colors.primary, fontWeight: '700' },
  badge: { borderRadius: radii.sm, paddingHorizontal: 4, backgroundColor: colors.textMuted },
  badgeText: { color: colors.onStatus, fontSize: 12, fontWeight: '700' },
  tip: { width: 2, height: 8, backgroundColor: colors.primary },
});
