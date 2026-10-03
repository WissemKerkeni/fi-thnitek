import type { Locale } from '@fi-thnitek/i18n';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chooseLocale } from '../src/i18n';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

/** Shown on first launch and from settings. Each option is labelled in its own language. */
export default function LanguageScreen() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Locale | null>(null);

  async function pick(locale: Locale) {
    setPending(locale);
    // Switching direction reloads the app; otherwise continue to home.
    await chooseLocale(locale);
    setPending(null);
    router.replace('/home');
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
