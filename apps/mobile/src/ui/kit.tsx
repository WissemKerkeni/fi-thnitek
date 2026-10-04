import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, elevation, radii, sizes, spacing } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/**
 * Building blocks of the approved Stitch screens (docs/ux.md §5): cards, tinted banners, chips, round
 * icon buttons, status pills and action tiles. All RTL-safe (logical start/end only).
 */

export function Card({
  children,
  tone = 'surface',
  style,
}: {
  children: ReactNode;
  tone?: 'surface' | 'tinted' | 'floating';
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        styles.card,
        tone === 'tinted' && styles.cardTinted,
        tone === 'floating' && [styles.cardFloating, elevation],
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A card's heading: icon + title, optional action on the end side. */
export function SectionTitle({
  icon,
  title,
  action,
}: {
  icon?: IconName;
  title: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionTitle}>
      {icon ? <Icon name={icon} size={20} color={colors.primary} /> : null}
      <Text variant="bodyStrong" style={styles.flex}>
        {title}
      </Text>
      {action}
    </View>
  );
}

const TONES = {
  info: { bg: colors.surfaceVariant, fg: colors.onSurfaceVariant, icon: colors.primary },
  success: { bg: colors.successContainer, fg: colors.success, icon: colors.success },
  warning: { bg: colors.warningContainer, fg: colors.warning, icon: colors.warning },
  danger: { bg: colors.dangerContainer, fg: colors.danger, icon: colors.danger },
} as const;
export type Tone = keyof typeof TONES;

/** A tinted message with an icon ("You're not visible on the map", warnings before consequences). */
export function Banner({
  icon,
  tone = 'info',
  children,
}: {
  icon: IconName;
  tone?: Tone;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]} accessibilityLiveRegion="polite">
      <Icon name={icon} size={22} color={t.icon} />
      <View style={styles.flex}>
        {typeof children === 'string' ? <Text style={{ color: t.fg }}>{children}</Text> : children}
      </View>
    </View>
  );
}

/** A small status badge: text plus a shape, never colour alone (docs/ux.md §4). */
export function Badge({ label, tone = 'info', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {icon ? <Icon name={icon} size={14} color={t.fg} /> : null}
      <Text variant="caption" style={{ color: t.fg }}>
        {label}
      </Text>
    </View>
  );
}

/** "● Visible" / "● Non visible": a dot + label pill. */
export function StatusPill({ label, on }: { label: string; on: boolean }) {
  return (
    <View style={[styles.statusPill, on ? styles.statusOn : styles.statusOff]}>
      <View style={[styles.dot, { backgroundColor: on ? colors.success : colors.textMuted }]} />
      <Text variant="caption" style={{ color: on ? colors.success : colors.onSurfaceVariant }}>
        {label}
      </Text>
    </View>
  );
}

export function Chip({
  label,
  icon,
  selected,
  onPress,
  accessibilityRole = 'button',
}: {
  label: string;
  icon?: ReactNode;
  selected?: boolean;
  onPress?: () => void;
  accessibilityRole?: 'button' | 'switch';
}) {
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === 'switch' ? { checked: !!selected } : { selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
    >
      {icon}
      <Text variant="label" style={{ color: selected ? colors.onPrimary : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

type IconButtonVariant = 'surface' | 'tonal' | 'filled';

/** A 48 dp icon-only button; `label` is read by screen readers. */
export function IconButton({
  icon,
  label,
  onPress,
  variant = 'surface',
  shape = 'round',
  floating,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  variant?: IconButtonVariant;
  shape?: 'round' | 'square';
  floating?: boolean;
}) {
  const bg =
    variant === 'filled' ? colors.primary : variant === 'tonal' ? colors.surfaceVariant : colors.surface;
  const fg = variant === 'filled' ? colors.onPrimary : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={spacing.xs}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: bg, borderRadius: shape === 'round' ? radii.pill : radii.md },
        floating && elevation,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} color={fg} />
    </Pressable>
  );
}

/** Equal-width action tile (icon over label), e.g. the D4 Stop / Pause / Full controls. */
export function ActionTile({
  icon,
  label,
  onPress,
  tone = 'info',
  active,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'info' | 'danger';
  active?: boolean;
  disabled?: boolean;
}) {
  const fg = active ? colors.onPrimary : tone === 'danger' ? colors.danger : colors.primary;
  const bg = active ? colors.primary : tone === 'danger' ? colors.dangerContainer : colors.surfaceVariant;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: bg },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon name={icon} color={fg} />
      <Text variant="label" style={[styles.tileLabel, { color: fg }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A tappable row: leading icon, title + subtitle, trailing chevron. */
export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string | null;
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {icon ? (
        <View style={styles.rowIcon}>
          <Icon name={icon} size={22} color={colors.primary} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text variant="caption" muted>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron-right" color={colors.textMuted} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardTinted: { borderColor: colors.surfaceVariant, backgroundColor: colors.surfaceVariant },
  cardFloating: { borderWidth: 0 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  statusOn: { backgroundColor: colors.successContainer },
  statusOff: { backgroundColor: colors.surfaceVariant },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipIdle: { backgroundColor: colors.surface, borderColor: colors.border },
  iconButton: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 72,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  tileLabel: { textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  rowPressed: { backgroundColor: colors.surfaceVariant },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceVariant,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
