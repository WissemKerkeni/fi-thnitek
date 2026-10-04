import type { TransportType } from '@fi-thnitek/contracts';
import { StyleSheet, View } from 'react-native';
import { colors, radii } from '../theme/tokens';
import { Icon, type IconName } from '../ui/Icon';

/**
 * Vehicle types look like the real ones: yellow taxis, white louages with a red band, blue buses. The
 * icon differs per type too, so the type never depends on colour alone (docs/ux.md §4).
 */
export const VEHICLE: Record<TransportType, { icon: IconName; bg: string; fg: string; band?: string }> = {
  TAXI: { icon: 'taxi', bg: colors.accent, fg: colors.onAccent },
  LOUAGE: { icon: 'van-passenger', bg: colors.surface, fg: colors.text, band: colors.danger },
  BUS: { icon: 'bus', bg: colors.primary, fg: colors.onPrimary },
};

export function VehicleBadge({ type, size = 32 }: { type: TransportType; size?: number }) {
  const v = VEHICLE[type];
  return (
    <View
      style={[styles.tile, { width: size, height: size, backgroundColor: v.bg }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Icon name={v.icon} size={size * 0.62} color={v.fg} />
      {v.band ? <View style={[styles.band, { backgroundColor: v.band }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  band: { position: 'absolute', start: 0, end: 0, bottom: 0, height: 4 },
});
