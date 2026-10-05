import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { ApiError } from '../src/lib/api';
import { shortDate, tunisParts } from '../src/routines/format';
import { colors, spacing } from '../src/theme/tokens';
import { AppLogo } from '../src/ui/AppHeader';
import { Button } from '../src/ui/Button';
import { Banner, Card, SectionTitle } from '../src/ui/kit';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';
import { TextField } from '../src/ui/TextField';

/** First-run step 1 (R-001): Google sign-in. */
export default function SignInScreen() {
  const { t } = useTranslation();
  const { signIn, endedReason, sanction } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountMessage = (code: string | null | undefined) =>
    code === 'ACCOUNT_SUSPENDED' ? t('auth.suspended') : code === 'ACCOUNT_BANNED' ? t('auth.banned') : null;

  async function onPress() {
    setBusy(true);
    setError(null);
    try {
      const result = await signIn();
      if (result === 'ok') router.replace('/');
      if (result === 'not-configured') setError(t('auth.notConfigured'));
    } catch (e) {
      const code = e instanceof ApiError ? e.problem?.code : undefined;
      // Suspended or banned: the card below explains why (the provider kept the details).
      setError(accountMessage(code) ? null : t('auth.failed'));
    } finally {
      setBusy(false);
    }
  }

  const sanctioned = endedReason === 'ACCOUNT_SUSPENDED' || endedReason === 'ACCOUNT_BANNED';
  const message = error ?? (sanctioned && sanction ? null : accountMessage(endedReason));

  return (
    <Screen topInset>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.hero}>
        <AppLogo size={88} />
        <Text variant="display" style={styles.brand}>
          في ثنيتك
        </Text>
        <Text variant="headline" muted>
          Fi thnitek
        </Text>
        <Text variant="title" style={styles.center}>
          {t('auth.title')}
        </Text>
        <Text muted style={styles.center}>
          {t('auth.subtitle')}
        </Text>
      </View>
      {message ? (
        <Banner icon="alert-circle-outline" tone="danger">
          {message}
        </Banner>
      ) : null}
      {sanctioned && sanction ? <SanctionCard /> : null}
      <Button label={t('auth.google')} icon="google" onPress={() => void onPress()} loading={busy} />
    </Screen>
  );
}

/** R-073: why the account is suspended or closed, until when, and the contact form. */
function SanctionCard() {
  const { t } = useTranslation();
  const { sanction, appeal } = useAuth();
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'already' | 'error'>('idle');
  if (!sanction) return null;
  const until = sanction.endsAt ? tunisParts(sanction.endsAt) : null;

  async function send() {
    setState('sending');
    try {
      await appeal(text.trim());
      setState('sent');
    } catch (e) {
      setState(e instanceof ApiError && e.problem?.code === 'CONFLICT' ? 'already' : 'error');
    }
  }

  return (
    <Card>
      <SectionTitle
        icon="account-lock-outline"
        title={sanction.type === 'BAN' ? t('safety.bannedTitle') : t('safety.suspendedTitle')}
      />
      <Text>{t('safety.reason', { reason: sanction.reason })}</Text>
      {until ? (
        <Text variant="bodyStrong">
          {t('safety.until', { date: `${shortDate(until.date)} ${until.time}` })}
        </Text>
      ) : null}
      <SectionTitle icon="email-outline" title={t('safety.contactTitle')} />
      {state === 'sent' || state === 'already' ? (
        <Banner icon="check-circle-outline" tone="success">
          {state === 'sent' ? t('safety.contactSent') : t('safety.contactAlready')}
        </Banner>
      ) : (
        <>
          <Text variant="caption" muted>
            {t('safety.contactHint')}
          </Text>
          <TextField
            label={t('safety.contactTitle')}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
          />
          {state === 'error' ? (
            <Banner icon="alert-circle-outline" tone="danger">
              {t('common.error')}
            </Banner>
          ) : null}
          <Button
            label={t('safety.contactSend')}
            icon="send"
            variant="secondary"
            disabled={text.trim().length < 10}
            loading={state === 'sending'}
            onPress={() => void send()}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  brand: { color: colors.primary },
  center: { textAlign: 'center' },
});
