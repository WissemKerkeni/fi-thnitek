import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

/** P6 "Me" (account part): driver entry, language, sign out, delete account (R-005). */
export default function MeScreen() {
  const { t } = useTranslation();
  const { session, signOut, deleteAccount } = useAuth();
  const name = session.status === 'signedIn' ? session.me.displayName : null;

  function confirmDelete() {
    Alert.alert(t('me.deleteConfirmTitle'), t('me.deleteConfirmBody'), [
      { text: t('me.cancel'), style: 'cancel' },
      {
        text: t('me.confirmDelete'),
        style: 'destructive',
        onPress: () => void deleteAccount().then(() => router.replace('/')),
      },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('map.me') }} />
      {name ? <Text variant="title">{t('me.greeting', { name })}</Text> : null}
      <Button
        label={
          session.status === 'signedIn' && session.me.driverVerification
            ? t('driver.statusTitle')
            : t('driver.entry')
        }
        variant="accent"
        onPress={() => router.push('/driver')}
        accessibilityHint={t('driver.entryHint')}
      />
      <Button label={t('language.title')} variant="secondary" onPress={() => router.push('/language')} />
      <Button
        label={t('me.signOut')}
        variant="secondary"
        onPress={() => void signOut().then(() => router.replace('/'))}
      />
      <Button label={t('me.deleteAccount')} variant="secondary" onPress={confirmDelete} />
    </Screen>
  );
}
