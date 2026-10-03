import type { Locale } from '@fi-thnitek/i18n';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../src/auth/AuthProvider';
import { chooseLocale } from '../src/i18n';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

/** First-run step 2 (after sign-in) and from settings. Each option is labelled in its own language. */
export default function LanguageScreen() {
  const { t } = useTranslation();
  const { session, updateMe } = useAuth();
  const [pending, setPending] = useState<Locale | null>(null);

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
      <Stack.Screen options={{ title: t('app.name') }} />
      <Text variant="title">{t('language.title')}</Text>
      <Button label={t('language.arabic')} onPress={() => void pick('ar')} loading={pending === 'ar'} />
      <Button
        label={t('language.french')}
        variant="secondary"
        onPress={() => void pick('fr')}
        loading={pending === 'fr'}
      />
    </Screen>
  );
}
