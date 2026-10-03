import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, sizes, spacing, typography } from '../theme/tokens';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'accent';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.border },
  accent: { bg: colors.accent, fg: colors.onAccent, border: colors.accent },
};

/** Full-width, ≥ 56 dp tall (≥ 48 dp touch target), label never truncated. RTL-safe (no left/right). */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  accessibilityHint,
}: ButtonProps) {
  const v = VARIANTS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={spacing.xs}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && styles.pressed,
        inactive && styles.inactive,
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={v.fg} /> : null}
        <Text variant="label" style={[styles.label, { color: v.fg }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: sizes.primaryButtonHeight,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  label: { ...typography.label, textAlign: 'center' },
  pressed: { opacity: 0.85 },
  inactive: { opacity: 0.5 },
});
