import { StyleSheet, View } from 'react-native';
import { colors, radii } from '../theme/tokens';

/** Height of the pin; its tip is the point. */
export const PIN_HEIGHT = 44;

/** The destination / picker pin: a dark-blue drop with a yellow core, readable on any basemap. */
export function DestinationPin() {
  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.head}>
        <View style={styles.core} />
      </View>
      <View style={styles.tip} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', height: PIN_HEIGHT },
  head: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: { width: 10, height: 10, borderRadius: radii.pill, backgroundColor: colors.accent },
  tip: { width: 3, height: 12, backgroundColor: colors.primary },
});
