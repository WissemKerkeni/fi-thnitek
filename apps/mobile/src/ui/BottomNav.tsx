import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface NavItem {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
}

/** The Stitch bottom navigation: icon over label, the active item filled in a pill. */
export function BottomNav({ items, active }: { items: readonly NavItem[]; active: string }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      accessibilityRole="tablist"
      accessibilityLabel={t('app.name')}
    >
      {items.map((item) => {
        const on = item.key === active;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={on ? undefined : item.onPress}
            style={styles.item}
          >
            <View style={[styles.indicator, on && styles.indicatorOn]}>
              <Icon name={item.icon} color={on ? colors.primary : colors.textMuted} />
            </View>
            <Text variant="caption" style={{ color: on ? colors.primary : colors.textMuted }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  item: { flex: 1, alignItems: 'center', gap: 2, minHeight: 56, justifyContent: 'center' },
  indicator: { paddingHorizontal: spacing.md, paddingVertical: 2, borderRadius: 16 },
  indicatorOn: { backgroundColor: colors.primaryContainer },
});
