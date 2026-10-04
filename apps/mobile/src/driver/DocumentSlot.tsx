import type { DocumentType, DocumentView } from '@fi-thnitek/contracts';
import { EXPIRING_DOCUMENTS } from '@fi-thnitek/domain';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { colors, radii, sizes, spacing, typography } from '../theme/tokens';
import { Icon, type IconName } from '../ui/Icon';
import { Badge, Banner, type Tone } from '../ui/kit';
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

const STATUS: Record<DocumentView['status'], { tone: Tone; icon: IconName }> = {
  PENDING: { tone: 'warning', icon: 'clock-outline' },
  ACCEPTED: { tone: 'success', icon: 'check-circle' },
  REJECTED: { tone: 'danger', icon: 'alert-circle' },
};

const DOC_ICON: Partial<Record<DocumentType, IconName>> = {
  CIN_FRONT: 'card-account-details-outline',
  CIN_BACK: 'card-account-details-outline',
  DRIVING_LICENCE: 'card-account-details-star-outline',
  PROFESSIONAL_CARD: 'badge-account-horizontal-outline',
  VEHICLE_REGISTRATION: 'file-document-outline',
  OPERATING_CARD: 'certificate-outline',
  OPERATOR_AUTHORISATION: 'certificate-outline',
};

/**
 * One required document (Stitch D1 "Documents officiels"): a card with its status chip, the rejection
 * reason, the expiry date when it expires, and a dashed photo area (camera or gallery).
 */
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

  const status = current ? STATUS[current.status] : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.docIcon}>
          <Icon name={DOC_ICON[type] ?? 'file-document-outline'} color={colors.primary} />
        </View>
        <Text variant="bodyStrong" style={styles.flex}>
          {t(`driver.docType_${type}`)}
        </Text>
        {current && status ? (
          <Badge label={t(`driver.doc_${current.status}`)} tone={status.tone} icon={status.icon} />
        ) : null}
      </View>

      {current?.status === 'REJECTED' && current.rejectionReason ? (
        <Banner icon="alert-circle-outline" tone="danger">
          {`${t('driver.reason')}: ${current.rejectionReason}`}
        </Banner>
      ) : null}

      {expiring ? (
        <View style={styles.dateWrap}>
          <Text variant="caption" muted>
            {t('driver.expiresOn')}
          </Text>
          <View style={styles.dateRow}>
            <DateBox value={day} onChange={setDay} placeholder={t('driver.day')} max={2} />
            <DateBox value={month} onChange={setMonth} placeholder={t('driver.month')} max={2} />
            <DateBox value={year} onChange={setYear} placeholder={t('driver.year')} max={4} wide />
          </View>
        </View>
      ) : null}

      {error ? (
        <Banner icon="alert-circle-outline" tone="danger">
          {error}
        </Banner>
      ) : null}

      {current?.status === 'ACCEPTED' ? (
        <View style={styles.compact}>
          <PhotoAction
            icon="camera-retake-outline"
            label={t('driver.replacePhoto')}
            busy={busy}
            onPress={() => void add('camera')}
          />
          <PhotoAction
            icon="image-outline"
            label={t('driver.choosePhoto')}
            disabled={busy}
            onPress={() => void add('library')}
          />
        </View>
      ) : (
        <View style={styles.dropzone}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              current ? `${t('driver.replacePhoto')} · ${t('driver.takePhoto')}` : t('driver.takePhoto')
            }
            disabled={busy}
            onPress={() => void add('camera')}
            style={styles.camera}
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Icon name="camera" color={colors.onPrimary} />
            )}
          </Pressable>
          <Text variant="bodyStrong" style={styles.center}>
            {current ? t('driver.replacePhoto') : t('driver.takePhoto')}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void add('library')}
            hitSlop={spacing.sm}
          >
            <Text variant="caption" style={styles.link}>
              {t('driver.choosePhoto')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function PhotoAction(props: {
  icon: IconName;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.busy || props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed, props.disabled && styles.disabled]}
    >
      {props.busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Icon name={props.icon} size={20} color={colors.primary} />
      )}
      <Text variant="caption" style={styles.link}>
        {props.label}
      </Text>
    </Pressable>
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
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceVariant,
  },
  dateWrap: { gap: spacing.xs },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
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
  dropzone: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primaryContainer,
    backgroundColor: colors.surfaceVariant,
  },
  camera: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  link: { color: colors.primary, fontWeight: '700' },
  compact: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: sizes.minTouchTarget,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
