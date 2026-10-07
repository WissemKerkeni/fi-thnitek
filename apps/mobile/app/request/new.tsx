import type { RequestableType } from '@fi-thnitek/contracts';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, StyleSheet, Switch, View } from 'react-native';
import { mapFilter } from '../../src/map/mapType';
import { VehicleBadge } from '../../src/map/VehicleBadge';
import { useDestination } from '../../src/places/destination';
import { langOf, placeNames } from '../../src/places/format';
import {
  DEFAULT_OPTIONS,
  explainerSeen,
  loadShowIdentity,
  markExplainerSeen,
  saveShowIdentity,
  takeNextRequestOptions,
} from '../../src/requests/draft';
import { requestErrorMessage, useCurrentRequest, useRequestActions } from '../../src/requests/useRequest';
import { tunisParts } from '../../src/routines/format';
import { SharingSetupError } from '../../src/sharing/useSharing';
import { colors, radii, sizes, spacing } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { Banner, Card, IconButton, SectionTitle } from '../../src/ui/kit';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';
import { TextField } from '../../src/ui/TextField';

const TYPES: RequestableType[] = ['TAXI', 'LOUAGE'];

/** P3 (Stitch "Nouvelle demande", R-030): type(s), seats, destination, note, name toggle (off by default). */
export default function NewRequestScreen() {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const destination = useDestination();
  const { post } = useRequestActions();
  const current = useCurrentRequest();
  const blockers = current.data?.blockers ?? [];
  const pausedUntil = current.data?.pausedUntil ?? null;
  const [initial] = useState(() => takeNextRequestOptions());
  // ADR-225: one type. "Post again" keeps the last one; otherwise the type shown on the map, if requestable.
  const [type, setType] = useState<RequestableType | null>(() => {
    const previous = (initial ?? DEFAULT_OPTIONS).types[0];
    if (previous) return previous;
    const shown = mapFilter().type;
    return shown === 'TAXI' || shown === 'LOUAGE' ? shown : null;
  });
  const [seats, setSeats] = useState(initial?.seats ?? DEFAULT_OPTIONS.seats);
  const [note, setNote] = useState(initial?.note ?? '');
  const [showIdentity, setShowIdentity] = useState(initial?.showIdentity ?? false);
  const [explainer, setExplainer] = useState(false);

  useEffect(() => {
    if (!initial) void loadShowIdentity().then(setShowIdentity);
    void explainerSeen().then((seen) => setExplainer(!seen));
  }, [initial]);

  function setIdentity(value: boolean) {
    setShowIdentity(value);
    saveShowIdentity(value);
  }

  function publish() {
    if (!destination) return;
    post.mutate(
      {
        destination: { point: destination.point, placeId: destination.place?.id ?? null },
        types: type ? [type] : [],
        seats,
        note: note.trim() || null,
        showIdentity,
      },
      {
        onSuccess: () => {
          markExplainerSeen();
          router.replace('/request');
        },
        onError: (error) => {
          const denied = error instanceof SharingSetupError && error.kind === 'denied';
          Alert.alert(
            denied ? t('sharing.permissionTitle') : t('requests.newTitle'),
            requestErrorMessage(t, error),
            denied
              ? [
                  { text: t('sharing.cancel'), style: 'cancel' },
                  { text: t('sharing.openSettings'), onPress: () => void Linking.openSettings() },
                ]
              : undefined,
          );
        },
      },
    );
  }

  // A place is attached only when the pin was on it (ADR-225); otherwise it is a point.
  const destName = destination
    ? destination.place
      ? placeNames(destination.place, lang).name
      : t('places.pinnedPoint')
    : null;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('requests.newTitle') }} />

      {pausedUntil ? (
        <Banner icon="pause-circle-outline" tone="danger">
          {t('safety.paused', { time: tunisParts(pausedUntil).time })}
        </Banner>
      ) : null}
      {blockers.includes('DEVICE_LIMIT') ? (
        <Banner icon="cellphone-lock" tone="danger">
          {t('safety.deviceLimit')}
        </Banner>
      ) : null}

      {explainer ? (
        <Card tone="tinted">
          <SectionTitle icon="information-outline" title={t('requests.explainerTitle')} />
          <Text>{t('requests.explainer')}</Text>
        </Card>
      ) : null}

      <Card>
        <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel={t('requests.types')}>
          {TYPES.map((option) => {
            const on = type === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setType(option)}
                style={[styles.tile, on && styles.tileOn]}
              >
                <VehicleBadge type={option} size={28} />
                <Text variant="label" style={on ? styles.tileTextOn : undefined}>
                  {t(`driver.type_${option}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.stepper}>
          <Icon name="seat-passenger" color={colors.primary} />
          <Text variant="bodyStrong" style={styles.flex}>
            {t('requests.seats')}
          </Text>
          <IconButton
            icon="minus"
            label="−"
            variant="tonal"
            onPress={() => setSeats((s) => Math.max(1, s - 1))}
          />
          <Text variant="headline" style={styles.seatValue}>
            {seats}
          </Text>
          <IconButton
            icon="plus"
            label="+"
            variant="filled"
            onPress={() => setSeats((s) => Math.min(8, s + 1))}
          />
        </View>
      </Card>

      <Card>
        <SectionTitle
          icon="map-marker"
          title={t('requests.destination')}
          action={
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/destination')}
              style={styles.change}
              hitSlop={spacing.sm}
            >
              <Text variant="caption" style={styles.link}>
                {t('requests.changeDestination')}
              </Text>
            </Pressable>
          }
        />
        <View style={styles.destination}>
          <Icon name="map-marker" size={28} color={colors.danger} />
          <Text variant="headline" style={styles.flex}>
            {destName ?? t('requests.chooseDestination')}
          </Text>
        </View>
        <TextField
          label={t('requests.note')}
          placeholder={t('requests.notePlaceholder')}
          value={note}
          onChangeText={setNote}
          maxLength={80}
        />
      </Card>

      <Card>
        <View style={styles.identityRow}>
          <Icon name={showIdentity ? 'account-eye' : 'incognito'} color={colors.primary} />
          <Text variant="bodyStrong" style={styles.flex}>
            {t('requests.showIdentity')}
          </Text>
          <Switch
            value={showIdentity}
            onValueChange={setIdentity}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.surface}
            accessibilityLabel={t('requests.showIdentity')}
          />
        </View>
        <Text variant="caption" muted>
          {showIdentity ? t('requests.showIdentityOn') : t('requests.showIdentityOff')}
        </Text>
      </Card>

      <Banner icon="radius-outline" tone="warning">
        {t('requests.zoneBody')}
      </Banner>

      <Button
        label={t('requests.publish')}
        subtitle={t('requests.askSubtitle')}
        icon="bullhorn-outline"
        loading={post.isPending}
        disabled={!destination || !type || pausedUntil !== null || blockers.includes('DEVICE_LIMIT')}
        onPress={publish}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: sizes.minTouchTarget,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileOn: { borderColor: colors.primary, backgroundColor: colors.primaryContainer },
  tileTextOn: { color: colors.primary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  seatValue: { minWidth: 32, textAlign: 'center' },
  change: { minHeight: 32, justifyContent: 'center' },
  link: { color: colors.primary, fontWeight: '700' },
  destination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.minTouchTarget,
  },
});
