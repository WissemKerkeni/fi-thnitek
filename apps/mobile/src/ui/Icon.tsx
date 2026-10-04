import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { I18nManager } from 'react-native';
import { colors } from '../theme/tokens';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Arrows and other directional glyphs point the reading way in Arabic (RTL). */
const DIRECTIONAL = new Set<IconName>([
  'arrow-left',
  'arrow-right',
  'chevron-left',
  'chevron-right',
  'navigation-variant',
]);

/** Material icons (the Stitch designs use the Material set). Decorative unless given a label. */
export function Icon({
  name,
  size = 24,
  color = colors.text,
  label,
}: {
  name: IconName;
  size?: number;
  color?: string;
  label?: string;
}) {
  const flip = I18nManager.isRTL && DIRECTIONAL.has(name);
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={color}
      style={flip ? { transform: [{ scaleX: -1 }] } : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    />
  );
}
