import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, sizes, spacing } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'tonal' | 'accent' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  /** A second, smaller line under the label (Stitch's "START SHARING · visible to every passenger"). */
  subtitle?: string;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.border },
  tonal: { bg: colors.surfaceVariant, fg: colors.primary, border: colors.surfaceVariant },
  accent: { bg: colors.accent, fg: colors.onAccent, border: colors.accent },
  danger: { bg: colors.dangerContainer, fg: colors.danger, border: colors.dangerContainer },
};

/** Full-width, ≥ 56 dp tall (≥ 48 dp touch target), label never truncated. RTL-safe (no left/right). */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  subtitle,
  disabled,
  loading,
  accessibilityHint,
}: ButtonProps) {
  const v = VARIANTS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${label}. ${subtitle}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={spacing.xs}
      style={({ pressed }) => [
        styles.base,
        subtitle ? styles.tall : null,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && styles.pressed,
        inactive && styles.inactive,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={v.fg} />
        ) : icon ? (
          <Icon name={icon} size={22} color={v.fg} />
        ) : null}
        <Text variant="label" style={[styles.label, { color: v.fg }]}>
          {label}
        </Text>
      </View>
      {subtitle ? (
        <Text variant="caption" style={[styles.subtitle, { color: v.fg }]}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: sizes.primaryButtonHeight,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    gap: 2,
  },
  tall: { minHeight: 68 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  label: { textAlign: 'center' },
  subtitle: { textAlign: 'center', opacity: 0.9 },
  pressed: { opacity: 0.85 },
  inactive: { opacity: 0.5 },
});
