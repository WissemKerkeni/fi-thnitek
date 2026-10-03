import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';
import { Text } from '../ui/Text';

const STEPS = ['stepYou', 'stepLicences', 'stepVehicle', 'stepReview'] as const;

/** D1 progress (approved Stitch design): numbered dots, current step highlighted, plus a test-data warning. */
export function StepHeader({ step }: { step: 1 | 2 | 3 | 4 }) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <View
        style={styles.row}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: 4, now: step }}
      >
        {STEPS.map((key, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <View key={key} style={styles.item}>
              <View style={[styles.dot, (done || active) && styles.dotOn]}>
                <Text style={[styles.dotText, (done || active) && styles.dotTextOn]}>{done ? '✓' : n}</Text>
              </View>
              <Text muted={!active} style={styles.label}>
                {t(`driver.${key}`)}
              </Text>
            </View>
          );
        })}
      </View>
      <Text muted>{t('driver.step', { n: step })}</Text>
      <Text style={styles.warning}>{t('driver.testDocsWarning')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  item: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  dot: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotText: { fontWeight: '700' },
  dotTextOn: { color: colors.onPrimary },
  label: { textAlign: 'center' },
  warning: {
    backgroundColor: colors.accent,
    color: colors.onAccent,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
});
