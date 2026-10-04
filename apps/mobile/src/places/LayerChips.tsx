import type { TranslationKey } from '@fi-thnitek/i18n';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { VehicleBadge } from '../map/VehicleBadge';
import { colors, spacing } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { Chip } from '../ui/kit';

export type Layer = 'taxi' | 'louage' | 'bus' | 'passengers';

const LAYERS: { id: Layer; label: TranslationKey }[] = [
  { id: 'taxi', label: 'map.layerTaxi' },
  { id: 'louage', label: 'map.layerLouage' },
  { id: 'bus', label: 'map.layerBus' },
  { id: 'passengers', label: 'map.layerPassengers' },
];

const TYPE = { taxi: 'TAXI', louage: 'LOUAGE', bus: 'BUS' } as const;

/** R-020 layer toggles as the Stitch filter chips. "On" = filled chip + check mark, not colour alone. */
export function LayerChips({
  visible,
  onToggle,
}: {
  visible: ReadonlySet<Layer>;
  onToggle: (layer: Layer) => void;
}) {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={t('map.layersLabel')}
    >
      {LAYERS.map(({ id, label }) => {
        const on = visible.has(id);
        return (
          <Chip
            key={id}
            label={t(label)}
            selected={on}
            accessibilityRole="switch"
            onPress={() => onToggle(id)}
            icon={
              on ? (
                <Icon name="check" size={18} color={colors.onPrimary} />
              ) : id === 'passengers' ? (
                <Icon name="human-handsup" size={18} color={colors.primary} />
              ) : (
                <VehicleBadge type={TYPE[id]} size={22} />
              )
            }
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingHorizontal: spacing.md },
});
