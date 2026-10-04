import { Text as RNText, type TextProps, StyleSheet } from 'react-native';
import { caption, colors, typography } from '../theme/tokens';

type Variant = keyof typeof typography | 'caption';

/**
 * Body text is never below 16 sp (docs/ux.md §4); `caption` (14 sp) is for secondary lines only.
 * Alignment follows the writing direction.
 */
export function Text({
  variant = 'body',
  muted,
  style,
  ...props
}: TextProps & { variant?: Variant; muted?: boolean }) {
  return (
    <RNText
      {...props}
      style={[
        styles.base,
        variant === 'caption' ? caption : typography[variant],
        muted && styles.muted,
        style,
      ]}
      maxFontSizeMultiplier={1.6}
    />
  );
}

const styles = StyleSheet.create({
  base: { color: colors.text, textAlign: 'auto', writingDirection: 'auto' },
  muted: { color: colors.textMuted },
});
