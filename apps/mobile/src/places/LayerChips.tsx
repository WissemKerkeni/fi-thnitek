import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import type { TranslationKey } from '@fi-thnitek/i18n';
import { colors, radii, sizes, spacing } from '../theme/tokens';
import { Text } from '../ui/Text';

export type Layer = 'taxi' | 'louage' | 'bus' | 'passengers';

const LAYERS: { id: Layer; icon: string; label: TranslationKey }[] = [
  { id: 'taxi', icon: '🚕', label: 'map.layerTaxi' },
  { id: 'louage', icon: '🚐', label: 'map.layerLouage' },
  { id: 'bus', icon: '🚌', label: 'map.layerBus' },
  { id: 'passengers', icon: '🧍', label: 'map.layerPassengers' },
];

/** R-020 layer toggles. "On" is shown by a check mark and a filled chip, never by colour alone. */
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
      {LAYERS.map(({ id, icon, label }) => {
        const on = visible.has(id);
        return (
          <Pressable
            key={id}
            accessibilityRole="switch"
            accessibilityState={{ checked: on }}
            accessibilityLabel={t(label)}
            onPress={() => onToggle(id)}
            style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
          >
            <Text style={on ? styles.textOn : undefined}>
              {on ? '✓ ' : ''}
              {icon} {t(label)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingHorizontal: spacing.md },
  chip: {
    minHeight: sizes.minTouchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipOff: { backgroundColor: colors.surface, borderColor: colors.border },
  textOn: { color: colors.onPrimary, fontWeight: '600' },
});
