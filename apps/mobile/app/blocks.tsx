import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { shortDate, tunisParts } from '../src/routines/format';
import { safetyErrorMessage, useBlocks, useUnblock } from '../src/safety/useSafety';
import { colors, radii, spacing } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
import { Icon } from '../src/ui/Icon';
import { Card } from '../src/ui/kit';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';

/** R-027 / R-071: the people the user blocked; unblocking makes them visible to each other again. */
export default function BlocksScreen() {
  const { t } = useTranslation();
  const blocks = useBlocks();
  const unblock = useUnblock();

  function confirmUnblock(id: string) {
    Alert.alert(t('safety.unblockConfirm'), undefined, [
      { text: t('requests.keep'), style: 'cancel' },
      {
        text: t('safety.unblock'),
        onPress: () =>
          unblock.mutate(id, {
            onError: (error) => Alert.alert(t('safety.unblock'), safetyErrorMessage(t, error)),
          }),
      },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('safety.blocksTitle') }} />
      {!blocks.data ? (
        <ActivityIndicator color={colors.primary} />
      ) : blocks.data.blocks.length === 0 ? (
        <Text muted style={styles.center}>
          {t('safety.blocksEmpty')}
        </Text>
      ) : (
        <Card>
          {blocks.data.blocks.map((b) => (
            <View key={b.id} style={styles.row}>
              <View style={styles.avatar}>
                <Icon name={b.kind === 'DRIVER' ? 'steering' : 'account-outline'} color={colors.onPrimary} />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong">
                  {b.name ?? (b.kind === 'PASSENGER' ? t('safety.anonymous') : t('safety.kind_DRIVER'))}
                </Text>
                <Text variant="caption" muted>
                  {t(`safety.kind_${b.kind}`)} ·{' '}
                  {t('safety.blockedOn', { date: shortDate(tunisParts(b.createdAt).date) })}
                </Text>
              </View>
              <View>
                <Button
                  label={t('safety.unblock')}
                  variant="secondary"
                  onPress={() => confirmUnblock(b.id)}
                />
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  center: { textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textMuted,
  },
});
