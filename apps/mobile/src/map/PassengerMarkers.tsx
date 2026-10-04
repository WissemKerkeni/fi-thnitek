import type { MapCluster, MapPassenger } from '@fi-thnitek/contracts';
import { Marker } from '@maplibre/maplibre-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { langOf } from '../places/format';
import { colors, elevation, radii, spacing } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { arrow } from '../ui/arrow';

/**
 * Waiting passengers (R-023/R-024). Exact markers (for matching sharing drivers) are solid pins with the
 * seat count; approximate ones are a soft circle around the ~100 m cell, with the destination.
 */
export function PassengerMarkers({
  passengers,
  onSelect,
}: {
  passengers: readonly MapPassenger[];
  onSelect?: (p: MapPassenger) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  return passengers.map((p) => {
    const dest = p.destination ? (lang === 'ar' ? p.destination.nameAr : p.destination.nameFr) : null;
    const label = `${t('map.layerPassengers')}${dest ? ` ${arrow()} ${dest}` : ''}`;
    return (
      <Marker key={p.id} id={`p-${p.id}`} lngLat={[p.lng, p.lat]} anchor={p.exact ? 'bottom' : 'center'}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          disabled={!onSelect}
          onPress={() => onSelect?.(p)}
          style={styles.wrap}
        >
          {p.exact ? (
            <>
              <View style={[styles.pin, elevation]}>
                <Icon name="human-handsup" size={18} color={colors.onPrimary} />
                <Text variant="caption" style={styles.seats}>
                  {p.seats}
                </Text>
              </View>
              <View style={styles.tip} />
            </>
          ) : (
            <View style={styles.zone}>
              <Icon name="human-handsup" size={18} color={colors.primary} />
            </View>
          )}
          {dest ? (
            <View style={styles.label}>
              <Text variant="caption" numberOfLines={1} style={styles.labelText}>
                {arrow()} {dest}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </Marker>
    );
  });
}

/** R-020: counts per area when zoomed out (vehicles and passengers). */
export function ClusterMarkers({
  clusters,
  onPress,
}: {
  clusters: readonly MapCluster[];
  onPress?: (c: MapCluster) => void;
}) {
  return clusters.map((c, i) => {
    const size = Math.min(72, 36 + Math.log2(c.count) * 8);
    return (
      <Marker key={`${c.lat},${c.lng},${i}`} id={`c-${i}`} lngLat={[c.lng, c.lat]} anchor="center">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={String(c.count)}
          onPress={() => onPress?.(c)}
          style={[styles.cluster, { width: size, height: size, borderRadius: size / 2 }]}
        >
          <Text variant="label" style={styles.clusterText}>
            {c.count}
          </Text>
        </Pressable>
      </Marker>
    );
  });
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2 },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
  },
  seats: { color: colors.onStatus, fontWeight: '700' },
  tip: { width: 2, height: 8, backgroundColor: colors.success },
  zone: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: 'rgba(11,74,139,0.12)',
  },
  label: { maxWidth: 140, paddingHorizontal: 6, borderRadius: radii.sm, backgroundColor: colors.surface },
  labelText: { color: colors.text },
  cluster: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.primary,
  },
  clusterText: { color: colors.onPrimary },
});
