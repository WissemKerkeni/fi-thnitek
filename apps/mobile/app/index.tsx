import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { nextRoute } from '../src/auth/next-route';
import { loadSavedLocale } from '../src/i18n';
import { locationStatus, refreshPosition } from '../src/location/myPosition';
import { colors } from '../src/theme/tokens';

/** Routes to the next first-run step (docs/ux.md §1), or home. */
export default function Index() {
  const { session } = useAuth();
  const [hasLanguage, setHasLanguage] = useState<boolean | null>(null);
  const [locationOk, setLocationOk] = useState<boolean | null>(null);

  useEffect(() => {
    void loadSavedLocale().then((saved) => setHasLanguage(saved !== null));
    void locationStatus().then((s) => {
      setLocationOk(s === 'ok');
      // Start finding the position now, so the map opens where the person is.
      if (s === 'ok') void refreshPosition();
    });
  }, [session]);

  const target =
    hasLanguage === null || locationOk === null ? null : nextRoute(session, hasLanguage, locationOk);
  if (target) return <Redirect href={target} />;
  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}
    >
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
