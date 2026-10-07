import type { TransportType } from '@fi-thnitek/contracts';
import type { TranslationKey } from '@fi-thnitek/i18n';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { type MapFilter, setMapFilter } from '../map/mapType';
import { VehicleBadge } from '../map/VehicleBadge';
import { colors, spacing } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { Chip } from '../ui/kit';

const TYPES: { type: TransportType; label: TranslationKey }[] = [
  { type: 'TAXI', label: 'map.layerTaxi' },
  { type: 'LOUAGE', label: 'map.layerLouage' },
  { type: 'BUS', label: 'map.layerBus' },
];

/**
 * R-020 filter chips: one vehicle type at a time (a radio group), plus waiting passengers on/off. The
 * selected chip is filled and keeps its vehicle icon (the state is also announced to screen readers).
 */
export function LayerChips({ filter }: { filter: MapFilter }) {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={t('map.layersLabel')}
      accessibilityRole="radiogroup"
    >
      {TYPES.map(({ type, label }) => (
        <Chip
          key={type}
          label={t(label)}
          selected={filter.type === type}
          onPress={() => setMapFilter({ ...filter, type })}
          icon={<VehicleBadge type={type} size={22} />}
        />
      ))}
      <Chip
        label={t('map.layerPassengers')}
        selected={filter.passengers}
        accessibilityRole="switch"
        onPress={() => setMapFilter({ ...filter, passengers: !filter.passengers })}
        icon={
          <Icon
            name="human-handsup"
            size={18}
            color={filter.passengers ? colors.onPrimary : colors.primary}
          />
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingHorizontal: spacing.md },
});
