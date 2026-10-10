import type { MapDriver } from '@fi-thnitek/contracts';
import { Marker } from '@maplibre/maplibre-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, elevation, radii, spacing } from '../theme/tokens';
import { Text } from '../ui/Text';
import { VehicleBadge } from './VehicleBadge';

/**
 * R-022: every sharing driver as a labelled marker (Stitch map home): the vehicle tile, the name (always
 * shown), the bus line, and "Full" / "Break" badges spelled out, not a colour only (ADR-227: a driver on
 * a break stays on the map, frozen and marked).
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
        accessibilityLabel={`${d.name}, ${t(`driver.type_${d.type}`)}${d.isFull ? `, ${t('sharing.fullBadge')}` : ''}${d.onBreak ? `, ${t('live.onBreak')}` : ''}`}
        onPress={() => onSelect(d)}
        style={styles.wrap}
      >
        <View style={[styles.label, elevation]}>
          <Text variant="caption" numberOfLines={1} style={styles.name}>
            {d.name}
            {d.lineLabel ? ` · ${d.lineLabel}` : ''}
          </Text>
          {d.onBreak ? (
            <View style={styles.pause}>
              <Text variant="caption" style={styles.pauseText}>
                {t('sharing.break')}
              </Text>
            </View>
          ) : d.isFull ? (
            <View style={styles.full}>
              <Text variant="caption" style={styles.fullText}>
                {t('sharing.fullBadge')}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.vehicle, (d.isFull || d.onBreak) && styles.dimmed]}>
          <VehicleBadge type={d.type} size={30} />
        </View>
      </Pressable>
    </Marker>
  ));
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2 },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 180,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  name: { flexShrink: 1, color: colors.text, fontWeight: '700' },
  full: { borderRadius: 4, paddingHorizontal: 4, backgroundColor: colors.dangerContainer },
  fullText: { color: colors.danger, fontWeight: '700' },
  pause: { borderRadius: 4, paddingHorizontal: 4, backgroundColor: colors.warningContainer },
  pauseText: { color: colors.warning, fontWeight: '700' },
  vehicle: { borderRadius: radii.sm, ...elevation },
  dimmed: { opacity: 0.55 },
});
