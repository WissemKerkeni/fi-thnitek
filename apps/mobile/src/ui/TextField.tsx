import { useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { colors, radii, sizes, spacing, typography } from '../theme/tokens';
import { Text } from './Text';

/**
 * Labelled input (Stitch fields): caption label, tinted field, primary border while focused; ≥ 48 dp,
 * 16 sp, text aligned with the writing direction (RTL-safe).
 */
export function TextField({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text variant="caption" style={styles.label}>
        {label}
      </Text>
      <TextInput
        maxFontSizeMultiplier={1.6}
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[styles.input, focused && styles.inputFocused, error ? styles.inputError : null, props.style]}
      />
      {error ? (
        <Text variant="caption" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { color: colors.onSurfaceVariant, fontWeight: '700' },
  input: {
    ...typography.body,
    minHeight: sizes.primaryButtonHeight,
    borderWidth: 2,
    borderColor: colors.surfaceVariant,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceVariant,
    color: colors.text,
    textAlign: 'auto',
  },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger },
});
