import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { spacing } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
import { Card, SectionTitle } from '../src/ui/kit';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

/**
 * Account and data (R-005): what the account is, and deleting it. Kept off the main profile so it is
 * reachable (store rules) but not one tap away; deleting asks twice.
 */
export default function AccountScreen() {
  const { t } = useTranslation();
  const { session, deleteAccount } = useAuth();
  const me = session.status === 'signedIn' ? session.me : null;
  const [busy, setBusy] = useState(false);

  function confirmDelete() {
    Alert.alert(t('me.deleteConfirmTitle'), t('me.deleteConfirmBody'), [
      { text: t('me.cancel'), style: 'cancel' },
      {
        text: t('me.confirmDelete'),
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void deleteAccount()
            .then(() => router.replace('/'))
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('me.account') }} />
      {me ? (
        <Card>
          <SectionTitle icon="account-outline" title={me.displayName ?? ''} />
          <View style={styles.row}>
            <Text muted>{t('role.title')}</Text>
            <Text variant="bodyStrong">{me.role === 'DRIVER' ? t('role.driver') : t('role.passenger')}</Text>
          </View>
          <Text variant="caption" muted>
            {t('role.final')}
          </Text>
        </Card>
      ) : null}
      <Card>
        <SectionTitle icon="delete-outline" title={t('me.deleteAccount')} />
        <Text muted>{t('me.deleteHint')}</Text>
        <Button
          label={t('me.deleteAccount')}
          variant="danger"
          icon="delete-outline"
          loading={busy}
          onPress={confirmDelete}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
});
