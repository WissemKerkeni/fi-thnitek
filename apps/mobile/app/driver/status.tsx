import type { VerificationState } from '@fi-thnitek/contracts';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Fragment, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useVerification } from '../../src/driver/useVerification';
import { colors, radii, spacing } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Icon, type IconName } from '../../src/ui/Icon';
import { Badge, Banner, Card, SectionTitle, type Tone } from '../../src/ui/kit';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';

const STATE: Record<VerificationState, { tone: Tone; icon: IconName }> = {
  DRAFT: { tone: 'info', icon: 'pencil-outline' },
  UNDER_REVIEW: { tone: 'warning', icon: 'clock-outline' },
  VERIFIED: { tone: 'success', icon: 'check-decagram' },
  CHANGES_REQUESTED: { tone: 'warning', icon: 'file-edit-outline' },
  EXPIRED: { tone: 'warning', icon: 'calendar-alert' },
  REJECTED: { tone: 'danger', icon: 'close-octagon-outline' },
  SUSPENDED: { tone: 'danger', icon: 'account-cancel-outline' },
};

const STEPS = [
  { key: 'timelineSubmitted', icon: 'file-send-outline' },
  { key: 'timelineReview', icon: 'magnify-scan' },
  { key: 'timelineVerified', icon: 'shield-check-outline' },
] as const;

/** Timeline position per state: steps before `done` are checked, `active` carries the state's tone. */
const PROGRESS: Record<VerificationState, { done: number; active: number | null }> = {
  DRAFT: { done: 0, active: 0 },
  UNDER_REVIEW: { done: 1, active: 1 },
  CHANGES_REQUESTED: { done: 1, active: 1 },
  REJECTED: { done: 1, active: 1 },
  VERIFIED: { done: 3, active: null },
  EXPIRED: { done: 2, active: 2 },
  SUSPENDED: { done: 2, active: 2 },
};

const TONE_FG: Record<Tone, string> = {
  info: colors.primary,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
};
const TONE_BG: Record<Tone, string> = {
  info: colors.surfaceVariant,
  success: colors.successContainer,
  warning: colors.warningContainer,
  danger: colors.dangerContainer,
};

/** D2 (Stitch "Statut de vérification"): status card, progress timeline, documents to redo (R-063). */
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
  const rejected = file.documents.filter((d) => d.status === 'REJECTED');
  const s = STATE[file.state];
  const progress = PROGRESS[file.state];

  return (
    <Screen>
      <Stack.Screen options={{ title: t('driver.statusTitle') }} />

      <Card>
        <SectionTitle
          icon="folder-account-outline"
          title={t('driver.fileTitle')}
          action={<Badge label={t(`driver.status_${file.state}`)} tone={s.tone} icon={s.icon} />}
        />
        {file.state === 'UNDER_REVIEW' ? (
          <Banner icon="timer-sand">{t('driver.underReviewHint')}</Banner>
        ) : null}
        {file.state === 'VERIFIED' ? (
          <Banner icon="check-circle-outline" tone="success">
            {t('driver.verifiedHint')}
          </Banner>
        ) : null}
        {file.decisionReason ? (
          <Banner icon="message-alert-outline" tone={s.tone}>
            {`${t('driver.reason')}: ${file.decisionReason}`}
          </Banner>
        ) : null}
      </Card>

      <Card>
        <SectionTitle icon="timeline-check-outline" title={t('driver.timelineTitle')} />
        <View>
          {STEPS.map((step, i) => {
            const done = i < progress.done;
            const active = i === progress.active;
            return (
              <Fragment key={step.key}>
                <View style={styles.step}>
                  <View
                    style={[
                      styles.node,
                      done && styles.nodeDone,
                      active && { backgroundColor: TONE_BG[s.tone], borderColor: TONE_FG[s.tone] },
                    ]}
                  >
                    <Icon
                      name={done ? 'check' : step.icon}
                      size={20}
                      color={done ? colors.onPrimary : active ? TONE_FG[s.tone] : colors.textMuted}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" muted={!done && !active}>
                      {t(`driver.${step.key}`)}
                    </Text>
                    {active ? (
                      <Text variant="caption" style={{ color: TONE_FG[s.tone] }}>
                        {t(`driver.status_${file.state}`)}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {i < STEPS.length - 1 ? (
                  <View style={[styles.connector, i < progress.done - 1 && styles.connectorDone]} />
                ) : null}
              </Fragment>
            );
          })}
        </View>
      </Card>

      {rejected.map((d) => (
        <Banner key={d.id} icon="file-alert-outline" tone="danger">
          <Text variant="bodyStrong" style={styles.danger}>
            {t(`driver.docType_${d.type}`)}
          </Text>
          {d.rejectionReason ? <Text style={styles.danger}>{d.rejectionReason}</Text> : null}
        </Banner>
      ))}

      {file.state === 'CHANGES_REQUESTED' ? (
        <Button
          label={t('driver.fixFile')}
          icon="file-edit-outline"
          onPress={() => router.replace('/driver/you')}
        />
      ) : null}
      {file.state === 'VERIFIED' ? (
        <Button
          label={t('sharing.startTitle')}
          icon="access-point"
          onPress={() => router.replace('/sharing')}
        />
      ) : null}
      {file.state === 'EXPIRED' ? (
        <Button
          label={t('driver.renewFile')}
          icon="calendar-refresh"
          onPress={() => router.replace('/driver/licences')}
        />
      ) : null}
      <Button label={t('common.retry')} icon="refresh" variant="secondary" onPress={() => void refresh()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  danger: { color: colors.danger },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  node: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  nodeDone: { backgroundColor: colors.success, borderColor: colors.success },
  connector: { width: 3, height: 20, marginStart: 18.5, borderRadius: 2, backgroundColor: colors.border },
  connectorDone: { backgroundColor: colors.success },
});
