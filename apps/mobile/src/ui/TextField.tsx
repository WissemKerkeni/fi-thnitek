import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { colors, radii, sizes, spacing, typography } from '../theme/tokens';
import { Text } from './Text';

/** Labelled input: ≥ 48 dp, 16 sp, text aligned with the writing direction (RTL-safe). */
export function TextField({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={styles.wrap}>
      <Text muted>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error ? styles.inputError : null, props.style]}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  input: {
    ...typography.body,
    minHeight: sizes.minTouchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
    textAlign: 'auto',
  },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger },
});
