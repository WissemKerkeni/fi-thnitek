import type { DocumentType, DocumentView } from '@fi-thnitek/contracts';
import { EXPIRING_DOCUMENTS } from '@fi-thnitek/domain';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { colors, radii, sizes, spacing, typography } from '../theme/tokens';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';
import { fromIsoDate, toIsoDate } from './date-input';
import { driverErrorMessage } from './errors';
import { pickDocumentPhoto } from './photo';

interface Props {
  type: DocumentType;
  /** The latest upload of this type, if any. */
  current?: DocumentView;
  onUploaded: () => void;
}

const STATUS_COLOR = { PENDING: colors.warning, ACCEPTED: colors.success, REJECTED: colors.danger } as const;
const STATUS_ICON = { PENDING: '…', ACCEPTED: '✓', REJECTED: '!' } as const;

/** One required document: status, rejection reason, expiry date (if it expires) and camera/gallery buttons. */
export function DocumentSlot({ type, current, onUploaded }: Props) {
  const { t } = useTranslation();
  const { api } = useAuth();
  const expiring = EXPIRING_DOCUMENTS.has(type);
  const initial = fromIsoDate(current?.expiresOn);
  const [day, setDay] = useState(initial.day);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(source: 'camera' | 'library') {
    setError(null);
    const expiresOn = expiring ? toIsoDate(day, month, year) : undefined;
    if (expiring && !expiresOn) return setError(t('driver.expiresOn'));
    const uri = await pickDocumentPhoto(source);
    if (!uri) return;
    setBusy(true);
    try {
      await api.uploadDocument({ type, uri, ...(expiresOn && { expiresOn }) });
      onUploaded();
    } catch (e) {
      setError(driverErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text variant="bodyStrong" style={styles.title}>
          {t(`driver.docType_${type}`)}
        </Text>
        {current ? (
          // Shape + text, not colour alone (docs/ux.md §4).
          <View style={[styles.badge, { backgroundColor: STATUS_COLOR[current.status] }]}>
            <Text style={styles.badgeText}>
              {STATUS_ICON[current.status]} {t(`driver.doc_${current.status}`)}
            </Text>
          </View>
        ) : null}
      </View>
      {current?.status === 'REJECTED' && current.rejectionReason ? (
        <Text style={styles.reason}>
          {t('driver.reason')}: {current.rejectionReason}
        </Text>
      ) : null}
      {expiring ? (
        <View>
          <Text muted>{t('driver.expiresOn')}</Text>
          <View style={styles.dateRow}>
            <DateBox value={day} onChange={setDay} placeholder={t('driver.day')} max={2} />
            <DateBox value={month} onChange={setMonth} placeholder={t('driver.month')} max={2} />
            <DateBox value={year} onChange={setYear} placeholder={t('driver.year')} max={4} wide />
          </View>
        </View>
      ) : null}
      {error ? (
        <Text style={styles.reason} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button
        label={current ? `${t('driver.replacePhoto')} · ${t('driver.takePhoto')}` : t('driver.takePhoto')}
        variant={current?.status === 'ACCEPTED' ? 'secondary' : 'primary'}
        onPress={() => void add('camera')}
        loading={busy}
      />
      <Button
        label={t('driver.choosePhoto')}
        variant="secondary"
        onPress={() => void add('library')}
        disabled={busy}
      />
    </View>
  );
}

function DateBox(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  max: number;
  wide?: boolean;
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={(v) => props.onChange(v.replace(/\D/g, ''))}
      placeholder={props.placeholder}
      placeholderTextColor={colors.textMuted}
      keyboardType="number-pad"
      maxLength={props.max}
      accessibilityLabel={props.placeholder}
      style={[styles.dateBox, props.wide && styles.dateBoxWide]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flexShrink: 1 },
  badge: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { color: colors.onStatus, fontWeight: '700' },
  reason: { color: colors.danger },
  dateRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  dateBox: {
    ...typography.body,
    minHeight: sizes.minTouchTarget,
    minWidth: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
    color: colors.text,
    backgroundColor: colors.surface,
  },
  dateBoxWide: { minWidth: 96 },
});
