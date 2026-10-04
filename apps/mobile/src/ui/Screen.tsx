import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme/tokens';

/**
 * Page container. The stack header (AppHeader) already pads the top; pass `topInset` on screens that
 * hide it. Uses logical (start/end) spacing only, so it mirrors correctly in RTL.
 */
export function Screen({ children, topInset }: { children: ReactNode; topInset?: boolean }) {
  return (
    <SafeAreaView
      style={styles.safe}
      edges={topInset ? ['top', 'bottom', 'left', 'right'] : ['bottom', 'left', 'right']}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.md },
});
