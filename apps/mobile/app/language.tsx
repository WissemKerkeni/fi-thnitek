import type { Locale } from '@fi-thnitek/i18n';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { chooseLocale } from '../src/i18n';
import { colors, radii, spacing } from '../src/theme/tokens';
import { AppLogo } from '../src/ui/AppHeader';
import { Icon } from '../src/ui/Icon';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

const OPTIONS: { locale: Locale; label: string; sample: string }[] = [
  { locale: 'ar', label: 'العربية', sample: 'وين ماشي؟' },
  { locale: 'fr', label: 'Français', sample: 'Où allez-vous ?' },
];

/** First-run step 2 (after sign-in) and from settings. Each option is labelled in its own language. */
export default function LanguageScreen() {
  const { t, i18n } = useTranslation();
  const { session, updateMe } = useAuth();
  const [pending, setPending] = useState<Locale | null>(null);
  const current = i18n.language.startsWith('fr') ? 'fr' : 'ar';

  async function pick(locale: Locale) {
    setPending(locale);
    try {
      // Save it on the account first: switching direction (ar <-> fr) reloads the app.
      if (session.status === 'signedIn') await updateMe({ locale });
      await chooseLocale(locale);
      router.replace('/');
    } finally {
      setPending(null);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('language.title') }} />
      <View style={styles.hero}>
        <AppLogo size={64} />
        <Text variant="title" style={styles.center}>
          {t('language.title')}
        </Text>
      </View>
      {OPTIONS.map((o) => {
        const on = o.locale === current;
        return (
          <Pressable
            key={o.locale}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, busy: pending === o.locale }}
            accessibilityLabel={o.label}
            disabled={pending !== null}
            onPress={() => void pick(o.locale)}
            style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && styles.pressed]}
          >
            <View style={[styles.badge, on && styles.badgeOn]}>
              <Text variant="headline" style={on ? styles.badgeTextOn : styles.badgeText}>
                {o.locale === 'ar' ? 'ع' : 'Fr'}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text variant="headline">{o.label}</Text>
              <Text variant="caption" muted>
                {o.sample}
              </Text>
            </View>
            {pending === o.locale ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Icon
                name={on ? 'check-circle' : 'circle-outline'}
                color={on ? colors.primary : colors.border}
              />
            )}
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  hero: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 72,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primaryContainer },
  badge: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceVariant,
  },
  badgeOn: { backgroundColor: colors.primary },
  badgeText: { color: colors.primary },
  badgeTextOn: { color: colors.onPrimary },
  pressed: { opacity: 0.85 },
});
