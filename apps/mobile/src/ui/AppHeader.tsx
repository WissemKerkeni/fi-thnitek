import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { colors, radii, spacing } from '../theme/tokens';
import { Icon } from './Icon';
import { IconButton } from './kit';
import { Text } from './Text';

/** The app mark: a blue tile with a yellow route pin (Stitch logo, ADR-212 palette). */
export function AppLogo({ size = 40 }: { size?: number }) {
  return (
    <View style={[styles.logo, { width: size, height: size, borderRadius: size * 0.28 }]}>
      <Icon name="map-marker-path" size={size * 0.6} color={colors.accent} />
    </View>
  );
}

/** "FR | عربي": the current language highlighted; opens the language screen. */
export function LanguagePill() {
  const { t, i18n } = useTranslation();
  const ar = !i18n.language.startsWith('fr');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('language.title')}
      onPress={() => router.push('/language')}
      style={styles.langPill}
    >
      <Text variant="caption" style={!ar ? styles.langOn : styles.langOff}>
        FR
      </Text>
      <Text variant="caption" style={styles.langOff}>
        |
      </Text>
      <Text variant="caption" style={ar ? styles.langOn : styles.langOff}>
        عربي
      </Text>
    </Pressable>
  );
}

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Shows the profile button (signed-in screens other than Me). */
  showProfile?: boolean;
}

/** The Stitch top bar: back, logo, title over a subtitle, language pill and profile. */
export function AppHeader({ title, subtitle, onBack, showProfile }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
      {onBack ? <IconButton icon="arrow-left" label={t('common.back')} onPress={onBack} /> : null}
      <AppLogo />
      <View style={styles.titles}>
        <Text variant="headline" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" muted numberOfLines={1}>
          {subtitle ?? 'في ثنيتك · Fi thnitek'}
        </Text>
      </View>
      <LanguagePill />
      {showProfile ? (
        <IconButton icon="account" label={t('map.me')} variant="filled" onPress={() => router.push('/me')} />
      ) : null}
    </View>
  );
}

const NO_PROFILE = new Set(['me', 'sign-in', 'language', 'terms', 'name']);

/** The part of the native-stack header props we use. */
interface StackHeaderProps {
  options: { title?: string };
  route: { name: string };
  back?: unknown;
  navigation: { goBack: () => void };
}

/** expo-router Stack `header`: every pushed screen gets the same top bar. */
export function StackHeader({ options, route, back, navigation }: StackHeaderProps) {
  const { session } = useAuth();
  const title = typeof options.title === 'string' ? options.title : route.name;
  return (
    <AppHeader
      title={title}
      onBack={back ? () => navigation.goBack() : undefined}
      showProfile={session.status === 'signedIn' && !NO_PROFILE.has(route.name)}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  logo: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  titles: { flex: 1, minWidth: 0 },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
  langOn: { color: colors.primary, fontWeight: '700' },
  langOff: { color: colors.textMuted },
});
