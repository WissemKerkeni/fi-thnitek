import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { nextRoute } from '../src/auth/next-route';
import { loadSavedLocale } from '../src/i18n';
import { colors } from '../src/theme/tokens';

/** Routes to the next first-run step (docs/ux.md §1), or home. */
export default function Index() {
  const { session } = useAuth();
  const [hasLanguage, setHasLanguage] = useState<boolean | null>(null);

  useEffect(() => {
    void loadSavedLocale().then((saved) => setHasLanguage(saved !== null));
  }, [session]);

  const target = hasLanguage === null ? null : nextRoute(session, hasLanguage);
  if (target) return <Redirect href={target} />;
  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}
    >
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
