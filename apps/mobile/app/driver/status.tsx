import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useVerification } from '../../src/driver/useVerification';
import { colors, radii, spacing } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';

const TIMELINE = ['DRAFT', 'UNDER_REVIEW', 'VERIFIED'] as const;
const TONE = {
  VERIFIED: colors.success,
  UNDER_REVIEW: colors.warning,
  CHANGES_REQUESTED: colors.warning,
  EXPIRED: colors.warning,
  REJECTED: colors.danger,
  SUSPENDED: colors.danger,
  DRAFT: colors.textMuted,
} as const;

/** D2: verification status, decision reason, documents to redo (R-063 in-app status). */
export default function VerificationStatus() {
  const { t } = useTranslation();
  const { refreshMe } = useAuth();
  const { data: file, refresh } = useVerification();

  // Re-read when the screen comes back into focus (e.g. after a decision push).
  useFocusEffect(
    useCallback(() => {
      void refresh();
      void refreshMe();
    }, [refresh, refreshMe]),
  );

  if (!file) return null;
  const stepIndex = file.state === 'VERIFIED' ? 2 : file.state === 'DRAFT' ? 0 : 1;
  const rejected = file.documents.filter((d) => d.status === 'REJECTED');

  return (
    <Screen>
      <Stack.Screen options={{ title: t('driver.statusTitle') }} />
      <View style={[styles.banner, { borderColor: TONE[file.state] }]}>
        <Text variant="title" style={{ color: TONE[file.state] }}>
          {t(`driver.status_${file.state}`)}
        </Text>
        {file.state === 'UNDER_REVIEW' ? <Text muted>{t('driver.underReviewHint')}</Text> : null}
        {file.state === 'VERIFIED' ? <Text muted>{t('driver.verifiedHint')}</Text> : null}
        {file.decisionReason ? (
          <Text>
            {t('driver.reason')}: {file.decisionReason}
          </Text>
        ) : null}
      </View>

      <View style={styles.timeline}>
        {TIMELINE.map((state, i) => (
          <View key={state} style={styles.timelineRow}>
            <View
              style={[
                styles.dot,
                i <= stepIndex && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              <Text style={i <= stepIndex ? styles.dotTextOn : undefined}>{i < stepIndex ? '✓' : i + 1}</Text>
            </View>
            <Text muted={i > stepIndex}>{t(`driver.status_${state}`)}</Text>
          </View>
        ))}
      </View>

      {rejected.map((d) => (
        <View key={d.id} style={styles.rejected}>
          <Text variant="bodyStrong">! {t(`driver.docType_${d.type}`)}</Text>
          {d.rejectionReason ? <Text>{d.rejectionReason}</Text> : null}
        </View>
      ))}

      {file.state === 'CHANGES_REQUESTED' ? (
        <Button label={t('driver.fixFile')} onPress={() => router.replace('/driver/you')} />
      ) : null}
      {file.state === 'EXPIRED' ? (
        <Button label={t('driver.renewFile')} onPress={() => router.replace('/driver/licences')} />
      ) : null}
      <Button label={t('common.retry')} variant="secondary" onPress={() => void refresh()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 2,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  timeline: { gap: spacing.sm },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotTextOn: { color: colors.onPrimary, fontWeight: '700' },
  rejected: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.surface,
  },
});
