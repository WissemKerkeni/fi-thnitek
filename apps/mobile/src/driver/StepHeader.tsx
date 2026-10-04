import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { Banner } from '../ui/kit';
import { Text } from '../ui/Text';

const STEPS = ['stepYou', 'stepLicences', 'stepVehicle', 'stepReview'] as const;

/**
 * D1 progress (Stitch "Vérification chauffeur"): check circles joined by a line, the current step
 * numbered, an "Étape n sur 4" pill, then the test-data warning.
 */
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
            <Fragment key={key}>
              {i > 0 ? <View style={[styles.line, n <= step && styles.lineOn]} /> : null}
              <View style={styles.item}>
                <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                  {done ? (
                    <Icon name="check" size={18} color={colors.onPrimary} />
                  ) : (
                    <Text variant="label" style={active ? styles.dotTextOn : styles.dotText}>
                      {n}
                    </Text>
                  )}
                </View>
                <Text variant="caption" muted={!active} style={[styles.label, active && styles.labelOn]}>
                  {t(`driver.${key}`)}
                </Text>
              </View>
            </Fragment>
          );
        })}
      </View>
      <View style={styles.pill}>
        <Text variant="caption" style={styles.pillText}>
          {t('driver.step', { n: step })}
        </Text>
      </View>
      <Banner icon="flask-outline" tone="warning">
        {t('driver.testDocsWarning')}
      </Banner>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  item: { alignItems: 'center', gap: spacing.xs, width: 64 },
  line: { flex: 1, height: 3, marginTop: 17, borderRadius: 2, backgroundColor: colors.border },
  lineOn: { backgroundColor: colors.success },
  dot: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  dotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotText: { color: colors.textMuted },
  dotTextOn: { color: colors.onPrimary },
  label: { textAlign: 'center' },
  labelOn: { color: colors.primary, fontWeight: '700' },
  pill: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.successContainer,
  },
  pillText: { color: colors.success, fontWeight: '700' },
});
