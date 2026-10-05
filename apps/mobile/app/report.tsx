import type { CreateReportInput, ReportCategory } from '@fi-thnitek/contracts';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { tunisParts } from '../src/routines/format';
import { approxInstant } from '../src/safety/approxTime';
import { safetyErrorMessage, useReport } from '../src/safety/useSafety';
import { colors, spacing } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
import { Card, Chip, SectionTitle } from '../src/ui/kit';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';
import { TextField } from '../src/ui/TextField';

type Source = CreateReportInput['source'];

const CATEGORIES: ReportCategory[] = [
  'NOBODY_THERE',
  'UNSAFE',
  'HARASSMENT',
  'FAKE_PROFILE',
  'SPAM',
  'OTHER',
];

const TITLE: Record<Source, 'reportDriver' | 'reportPassenger' | 'reportRequest' | 'reportSession'> = {
  DRIVER_MARKER: 'reportDriver',
  PASSENGER_MARKER: 'reportPassenger',
  MY_REQUEST: 'reportRequest',
  MY_SESSION: 'reportSession',
};

/**
 * R-070 / R-071: report from a marker (with "also block"), from the passenger's request history, or
 * from the driver's session history with an approximate time. Params: `source`, `id` (session or
 * request id) and, for a session, `from` / `to` (ISO).
 */
export default function ReportScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ source: Source; id: string; from?: string; to?: string }>();
  const source = params.source;
  const report = useReport();
  // "Nobody there" only fits a driver looking at a passenger's spot.
  const categories = CATEGORIES.filter((c) => c !== 'NOBODY_THERE' || source === 'PASSENGER_MARKER');
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState('');
  const [block, setBlock] = useState(false);
  const window =
    source === 'MY_SESSION' && params.from && params.to ? { from: params.from, to: params.to } : null;
  const [time, setTime] = useState(() => (window ? tunisParts(window.to).time : ''));
  const approxAt = window ? approxInstant(time, window.from, window.to) : null;
  const marker = source === 'DRIVER_MARKER' || source === 'PASSENGER_MARKER';

  function input(c: ReportCategory): CreateReportInput | null {
    const common = { category: c, description: description.trim() };
    switch (source) {
      case 'DRIVER_MARKER':
        return { source, sessionId: params.id, block, ...common };
      case 'PASSENGER_MARKER':
        return { source, requestId: params.id, block, ...common };
      case 'MY_REQUEST':
        return { source, requestId: params.id, ...common };
      case 'MY_SESSION':
        return approxAt ? { source, sessionId: params.id, approxAt, ...common } : null;
    }
  }

  function send() {
    const body = category ? input(category) : null;
    if (!body) return;
    report.mutate(body, {
      onSuccess: (r) => {
        Alert.alert(t('safety.reportTitle'), r.blocked ? t('safety.sentBlocked') : t('safety.sent'));
        router.back();
      },
      onError: (error) => Alert.alert(t('safety.reportTitle'), safetyErrorMessage(t, error)),
    });
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t(`safety.${TITLE[source]}`) }} />
      <Text muted>{t('safety.reportIntro')}</Text>

      <Card>
        <SectionTitle icon="flag-outline" title={t('safety.category')} />
        <View style={styles.chips}>
          {categories.map((c) => (
            <Chip
              key={c}
              label={t(`safety.category_${c}`)}
              selected={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </View>
      </Card>

      {window ? (
        <Card>
          <SectionTitle icon="clock-outline" title={t('safety.approxTime')} />
          <TextField
            label={t('safety.approxTimeHint', {
              from: tunisParts(window.from).time,
              to: tunisParts(window.to).time,
            })}
            value={time}
            onChangeText={setTime}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            error={time.length >= 4 && !approxAt ? t('safety.approxTimeInvalid') : null}
          />
        </Card>
      ) : null}

      <Card>
        <TextField
          label={t('safety.description')}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={500}
        />
        <Text variant="caption" muted>
          {t('safety.descriptionHint')}
        </Text>
      </Card>

      {marker ? (
        <Card>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{t('safety.alsoBlock')}</Text>
              <Text variant="caption" muted>
                {t('safety.alsoBlockHint')}
              </Text>
            </View>
            <Switch
              value={block}
              onValueChange={setBlock}
              trackColor={{ true: colors.primary }}
              accessibilityLabel={t('safety.alsoBlock')}
            />
          </View>
        </Card>
      ) : null}

      <Button
        label={t('safety.send')}
        icon="send"
        variant="danger"
        disabled={!category || (window !== null && !approxAt)}
        loading={report.isPending}
        onPress={send}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
});
