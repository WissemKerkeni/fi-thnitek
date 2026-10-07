import type { ExactPassenger, MapDriver, SharingStatus } from '@fi-thnitek/contracts';
import {
  Camera,
  Map as MapView,
  UserLocation,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_ZOOM, MAP_STYLE_URL, TUNIS_CENTER } from '../src/lib/map';
import { DriverCard } from '../src/map/DriverCard';
import { DriverMarkers } from '../src/map/DriverMarkers';
import { VehicleBadge } from '../src/map/VehicleBadge';
import { PassengerCard } from '../src/map/PassengerCard';
import { ClusterMarkers, PassengerMarkers } from '../src/map/PassengerMarkers';
import { PassengerQueue } from '../src/map/PassengerQueue';
import { useAnimatedPositions } from '../src/map/useAnimatedPositions';
import { useLiveMap } from '../src/map/useLiveMap';
import { bboxAround, bboxOf } from '../src/map/viewport';
import { langOf, placeNames } from '../src/places/format';
import {
  applySuggestedHeadingTo,
  setHeadingTo,
  useHeadingTo,
  useHeadingToSuggested,
} from '../src/sharing/headingTo';
import { breakLabel, clockTime, countdown } from '../src/sharing/time';
import { useChooseHeading } from '../src/sharing/useChooseHeading';
import {
  SharingSetupError,
  sharingErrorMessage,
  useSharingActions,
  useSharingStatus,
} from '../src/sharing/useSharing';
import { colors, elevation, radii, spacing } from '../src/theme/tokens';
import { AppHeader } from '../src/ui/AppHeader';
import { Button } from '../src/ui/Button';
import { Icon } from '../src/ui/Icon';
import { ActionTile, Badge, Banner, Card, IconButton, SectionTitle, StatusPill } from '../src/ui/kit';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';
import { TextField } from '../src/ui/TextField';
import { useNow } from '../src/ui/useNow';

/**
 * The driver home, as the Stitch screens "Commencer le partage" (D3), "En partage · Visible" (D4) and
 * "On break" (R-050…R-058).
 */
export default function SharingScreen() {
  const { t } = useTranslation();
  const status = useSharingStatus();

  if (!status.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('sharing.title') }} />
        {status.isError ? (
          <>
            <Banner icon="wifi-off" tone="danger">
              {t('common.error')}
            </Banner>
            <Button label={t('common.retry')} icon="refresh" onPress={() => void status.refetch()} />
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </Screen>
    );
  }
  const s = status.data.session;
  if (!s) return <StartView status={status.data} />;
  return s.state === 'ON_BREAK' ? <BreakView status={status.data} /> : <LiveView status={status.data} />;
}

function useErrorAlert() {
  const { t } = useTranslation();
  return (error: unknown) => {
    const denied = error instanceof SharingSetupError && error.kind === 'denied';
    Alert.alert(
      denied ? t('sharing.permissionTitle') : t('sharing.title'),
      sharingErrorMessage(t, error),
      denied
        ? [
            { text: t('sharing.cancel'), style: 'cancel' },
            { text: t('sharing.openSettings'), onPress: () => void Linking.openSettings() },
          ]
        : undefined,
    );
  };
}

// ---------- D3 · Start sharing ----------

function StartView({ status }: { status: SharingStatus }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const now = useNow();
  const headingTo = useHeadingTo();
  const suggested = useHeadingToSuggested();
  const [line, setLine] = useState('');

  useEffect(() => applySuggestedHeadingTo(status.suggestedHeadingTo), [status.suggestedHeadingTo]);
  const { start } = useSharingActions();
  const showError = useErrorAlert();
  const isBus = status.vehicle?.transportType === 'BUS';
  const cooldownLeft = status.cooldownUntil && new Date(status.cooldownUntil).getTime() > now;
  const hardBlockers = status.blockers.filter((b) => b !== 'COOLDOWN');
  const recentEnd =
    status.lastEnded && now - new Date(status.lastEnded.endedAt).getTime() < 12 * 3_600_000
      ? status.lastEnded
      : null;
  const headingNames = headingTo ? placeNames(headingTo, lang) : null;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('sharing.startTitle') }} />

      <View style={styles.modeRow}>
        <Text variant="bodyStrong" style={styles.flex}>
          {t('sharing.driverMode')}
        </Text>
        <StatusPill label={t('sharing.onBreakShort')} on={false} />
      </View>
      <Banner icon="eye-off-outline">{t('sharing.notVisibleHint')}</Banner>

      {status.vehicle ? (
        <Card>
          <View style={styles.row}>
            <VehicleBadge type={status.vehicle.transportType} size={48} />
            <View style={styles.flex}>
              <Text variant="headline">{t(`driver.type_${status.vehicle.transportType}`)}</Text>
              <Text variant="caption" muted>
                {t('sharing.vehicle')}
              </Text>
            </View>
            <Badge label={t('sharing.verified')} tone="success" icon="check-decagram" />
          </View>
          <View style={styles.plate}>
            <Icon name="card-account-details-outline" size={20} color={colors.onSurfaceVariant} />
            <Text variant="bodyStrong" style={styles.flex}>
              {status.vehicle.plateDisplay}
            </Text>
          </View>
        </Card>
      ) : null}

      <Card>
        <SectionTitle
          icon="compass-outline"
          title={t('sharing.trip')}
          action={
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/destination', params: { purpose: 'heading' } })}
              style={styles.changeChip}
            >
              <Icon name="pencil" size={16} color={colors.primary} />
              <Text variant="caption" style={styles.link}>
                {t('sharing.change')}
              </Text>
            </Pressable>
          }
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/destination', params: { purpose: 'heading' } })}
          style={styles.destination}
        >
          <Icon name="map-marker" size={28} color={colors.danger} />
          <View style={styles.flex}>
            <Text variant="caption" muted>
              {t('sharing.headingTo')}
            </Text>
            <Text variant="headline">{headingNames ? headingNames.name : t('sharing.headingToChoose')}</Text>
            {headingNames?.other ? (
              <Text variant="caption" muted>
                {headingNames.other}
              </Text>
            ) : !headingNames ? (
              <Text variant="caption" muted>
                {t('sharing.headingToNone')}
              </Text>
            ) : null}
          </View>
          {headingTo ? (
            <IconButton
              icon="close"
              label={t('sharing.headingToClear')}
              variant="surface"
              onPress={() => setHeadingTo(null)}
            />
          ) : null}
        </Pressable>
        {suggested && headingTo ? (
          <Badge label={t('sharing.suggested')} tone="success" icon="calendar-clock" />
        ) : null}
        {isBus ? (
          <TextField
            label={t('sharing.lineLabel')}
            placeholder={t('sharing.linePlaceholder')}
            value={line}
            onChangeText={setLine}
            maxLength={24}
            autoCapitalize="characters"
          />
        ) : null}
      </Card>

      {recentEnd ? (
        <Banner icon="information-outline" tone="warning">
          {t('sharing.lastEnded', { reason: t(`sharing.reason_${recentEnd.reason}`) })}
        </Banner>
      ) : null}
      {cooldownLeft && status.cooldownUntil ? (
        <Card style={styles.cooldown}>
          <Icon name="timer-sand" size={28} color={colors.warning} />
          <Text variant="bodyStrong" style={styles.center}>
            {t('sharing.cooldown', { time: clockTime(status.cooldownUntil, lang) })}
          </Text>
          <Text variant="display" accessibilityLiveRegion="polite">
            {countdown(status.cooldownUntil, now)}
          </Text>
        </Card>
      ) : null}
      {hardBlockers.map((b) => (
        <Banner key={b} icon="alert-circle-outline" tone="danger">
          {t(`sharing.blocker_${b}`)}
        </Banner>
      ))}
      {hardBlockers.includes('NOT_VERIFIED') || hardBlockers.includes('NO_VEHICLE') ? (
        <Button
          label={t('sharing.myFile')}
          icon="file-document-outline"
          variant="secondary"
          onPress={() => router.push('/driver/status')}
        />
      ) : null}

      <Button
        label={t('sharing.start')}
        subtitle={t('sharing.startSubtitle')}
        icon="access-point"
        loading={start.isPending}
        disabled={hardBlockers.length > 0 || !!cooldownLeft}
        onPress={() =>
          start.mutate(
            { headingToPlaceId: headingTo?.id ?? null, lineLabel: isBus && line.trim() ? line.trim() : null },
            { onError: showError },
          )
        }
      />
      <View style={styles.gpsNote}>
        <Icon name="crosshairs-gps" size={16} color={colors.textMuted} />
        <Text variant="caption" muted style={styles.flex}>
          {t('sharing.startHint')}
        </Text>
      </View>
      <Button
        label={t('sharing.myRoutines')}
        icon="calendar-clock"
        variant="tonal"
        onPress={() => router.push('/routines')}
      />
    </Screen>
  );
}

// ---------- D4 · Live map while sharing ----------

function LiveView({ status }: { status: SharingStatus }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const insets = useSafeAreaInsets();
  const s = status.session!;
  const { setFull, takeBreak, stop } = useSharingActions();
  const chooseHeading = useChooseHeading();
  const showError = useErrorAlert();
  const [bbox, setBbox] = useState(() => bboxAround(TUNIS_CENTER));
  const [selected, setSelected] = useState<MapDriver | null>(null);
  const [passenger, setPassenger] = useState<ExactPassenger | null>(null);
  const [breakOpen, setBreakOpen] = useState(false);
  // R-025: drivers see each other (and their passengers) while sharing with a fresh fix (else 403).
  const live = useLiveMap(bbox, s.fresh);
  const drivers = useAnimatedPositions(useMemo(() => live.data?.drivers ?? [], [live.data]));
  const exact = useMemo(
    () => (live.data?.passengers ?? []).filter((p): p is ExactPassenger => p.exact),
    [live.data],
  );
  const heading = s.headingTo ? placeNames(s.headingTo, lang).name : null;

  function onRegionDidChange(e: NativeSyntheticEvent<ViewStateChangeEvent>) {
    setBbox(bboxOf(e.nativeEvent.bounds));
  }

  function confirmStop() {
    const shortest = status.breakOptionsMin[0];
    Alert.alert(t('sharing.stopConfirmTitle'), t('sharing.stopConfirmBody'), [
      { text: t('sharing.cancel'), style: 'cancel' },
      ...(shortest
        ? [
            {
              text: t('sharing.takeBreak', { minutes: shortest }),
              onPress: () => takeBreak.mutate(shortest, { onError: showError }),
            },
          ]
        : []),
      {
        text: t('sharing.stopAnyway'),
        style: 'destructive' as const,
        onPress: () => stop.mutate(undefined, { onError: showError }),
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title={t('sharing.liveTitle')}
        subtitle={s.fresh ? t('sharing.visibleShort') : t('sharing.reconnectingShort')}
        showProfile
      />

      <View style={styles.liveTop}>
        <View
          style={[styles.liveBanner, s.fresh ? styles.liveOk : styles.liveWarn]}
          accessibilityLiveRegion="polite"
        >
          <View style={[styles.liveDot, { backgroundColor: s.fresh ? colors.success : colors.warning }]} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">{s.fresh ? t('sharing.visible') : t('sharing.reconnecting')}</Text>
            <Text variant="caption" muted numberOfLines={1}>
              {t(`driver.type_${s.transportType}`)} · {s.plateDisplay}
              {s.lineLabel ? ` · ${s.lineLabel}` : ''}
            </Text>
          </View>
          {s.isFull ? <Badge label={t('sharing.fullBadge')} tone="danger" icon="account-cancel" /> : null}
        </View>
        <View style={styles.tiles}>
          <ActionTile
            icon="power"
            label={t('sharing.stop')}
            tone="danger"
            disabled={stop.isPending}
            onPress={confirmStop}
          />
          <ActionTile
            icon="coffee-outline"
            label={t('sharing.break')}
            disabled={takeBreak.isPending}
            onPress={() => setBreakOpen(true)}
          />
          <ActionTile
            icon={s.isFull ? 'account-check-outline' : 'account-cancel-outline'}
            label={s.isFull ? t('sharing.available') : t('sharing.imFull')}
            active={s.isFull}
            disabled={setFull.isPending}
            onPress={() => setFull.mutate(!s.isFull, { onError: showError })}
          />
        </View>
      </View>

      <View style={styles.flex}>
        <MapView
          style={styles.flex}
          mapStyle={MAP_STYLE_URL}
          attribution
          logo={false}
          compass
          onRegionDidChange={onRegionDidChange}
        >
          <Camera
            initialViewState={{ center: TUNIS_CENTER, zoom: DEFAULT_ZOOM }}
            trackUserLocation="default"
          />
          <UserLocation accuracy heading />
          <DriverMarkers drivers={drivers} onSelect={setSelected} />
          <PassengerMarkers
            passengers={live.data?.passengers ?? []}
            onSelect={(p) => (p.exact ? setPassenger(p) : undefined)}
          />
          <ClusterMarkers clusters={live.data?.clusters ?? []} />
        </MapView>

        <View style={styles.mapTop} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/destination', params: { purpose: 'heading' } })}
            style={[styles.headingChip, elevation]}
          >
            <Icon name="map-marker" size={20} color={colors.danger} />
            <Text variant="label" numberOfLines={1} style={styles.flex}>
              {heading ? t('live.headingTo', { name: heading }) : t('sharing.headingToChoose')}
            </Text>
            {heading ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('sharing.headingToClear')}
                hitSlop={spacing.sm}
                onPress={() => void chooseHeading(null).catch(showError)}
              >
                <Icon name="close" size={20} color={colors.textMuted} />
              </Pressable>
            ) : (
              <Icon name="chevron-right" size={20} color={colors.textMuted} />
            )}
          </Pressable>
          {live.data?.clustered ? (
            <View style={styles.zoomPill}>
              <Text variant="caption" style={styles.zoomText}>
                {t('live.zoomIn')}
              </Text>
            </View>
          ) : null}
        </View>

        {passenger || selected ? (
          <View style={[styles.mapBottom, { bottom: spacing.md }]}>
            {passenger ? (
              <PassengerCard passenger={passenger} onClose={() => setPassenger(null)} />
            ) : selected ? (
              <DriverCard driver={selected} onClose={() => setSelected(null)} />
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Stitch D4: the passenger queue under the map, grouped by destination (docs/architecture.md §5.3). */}
      <View style={[styles.queue, { paddingBottom: insets.bottom + spacing.sm }]}>
        <SectionTitle
          icon="human-handsup"
          title={t('passenger.queueTitle')}
          action={exact.length > 0 ? <Badge label={String(exact.length)} tone="success" /> : undefined}
        />
        <ScrollView style={styles.queueList} contentContainerStyle={styles.queueContent}>
          <PassengerQueue passengers={exact} onSelect={setPassenger} />
        </ScrollView>
      </View>

      <Modal transparent visible={breakOpen} animationType="fade" onRequestClose={() => setBreakOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setBreakOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('live.close')}
        >
          {/* Swallows taps inside the sheet; not a control itself. */}
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
            onPress={() => undefined}
            accessible={false}
          >
            <View style={styles.grabber} />
            <SectionTitle icon="coffee-outline" title={t('sharing.breakTitle')} />
            <Banner icon="eye-off-outline">{t('sharing.breakHint')}</Banner>
            <View style={styles.breakOptions}>
              {status.breakOptionsMin.map((minutes) => {
                const label = breakLabel(minutes);
                return (
                  <View key={minutes} style={styles.flex}>
                    <Button
                      label={
                        label.key === 'sharing.breakHours'
                          ? t(label.key, { hours: label.value })
                          : t(label.key, { minutes: label.value })
                      }
                      variant="tonal"
                      onPress={() => {
                        setBreakOpen(false);
                        takeBreak.mutate(minutes, { onError: showError });
                      }}
                    />
                  </View>
                );
              })}
            </View>
            <Button label={t('sharing.cancel')} variant="secondary" onPress={() => setBreakOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---------- On break ----------

function BreakView({ status }: { status: SharingStatus }) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const now = useNow();
  const s = status.session!;
  const { resume, stop } = useSharingActions();
  const showError = useErrorAlert();
  const until = s.breakUntil!;
  const over = now >= new Date(until).getTime();
  // ADR-227: on the map as "on break" (frozen where it began); Resume works at any time.

  return (
    <Screen>
      <Stack.Screen options={{ title: t('sharing.onBreakShort') }} />
      <View style={styles.modeRow}>
        <Text variant="bodyStrong" style={styles.flex}>
          {t('sharing.driverMode')}
        </Text>
        <StatusPill label={t('sharing.notVisible')} on={false} />
      </View>

      <Banner icon="weather-night" tone="warning">
        {t('sharing.breakModeActive')}
      </Banner>
      <Card style={styles.breakCard}>
        <View style={styles.breakIcon}>
          <Icon name="coffee" size={36} color={colors.warning} />
        </View>
        <Text variant="title" style={styles.center}>
          {t('sharing.onBreakUntil', { time: clockTime(until, lang) })}
        </Text>
        <View style={[styles.ring, over && styles.ringDone]} accessibilityLiveRegion="polite">
          {over ? (
            <Icon name="play-circle-outline" size={48} color={colors.success} />
          ) : (
            <Text variant="display">{countdown(until, now)}</Text>
          )}
        </View>
        <Text muted style={styles.center}>
          {t('sharing.breakHint')}
        </Text>
      </Card>

      <Banner icon="play-circle-outline">{t('sharing.resumeAt', { time: clockTime(until, lang) })}</Banner>
      <Button
        label={t('sharing.resumeNow')}
        icon="play"
        loading={resume.isPending}
        onPress={() => resume.mutate(undefined, { onError: showError })}
      />
      <Button
        label={t('sharing.stop')}
        icon="power"
        variant="danger"
        loading={stop.isPending}
        onPress={() =>
          Alert.alert(t('sharing.stopConfirmTitle'), t('sharing.stopConfirmBody'), [
            { text: t('sharing.cancel'), style: 'cancel' },
            {
              text: t('sharing.stopAnyway'),
              style: 'destructive',
              onPress: () => stop.mutate(undefined, { onError: showError }),
            },
          ])
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  link: { color: colors.primary, fontWeight: '700' },
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
  changeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
  destination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceVariant,
  },
  cooldown: { alignItems: 'center', borderColor: colors.warning },
  gpsNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'center' },
  liveTop: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radii.md,
  },
  liveOk: { backgroundColor: colors.successContainer },
  liveWarn: { backgroundColor: colors.warningContainer },
  liveDot: { width: 12, height: 12, borderRadius: 6 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  mapTop: { position: 'absolute', top: spacing.sm, start: spacing.md, end: spacing.md, gap: spacing.sm },
  headingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  zoomPill: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.text,
  },
  zoomText: { color: colors.onPrimary },
  queue: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  queueList: { maxHeight: 220 },
  queueContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  mapBottom: { position: 'absolute', start: spacing.md, end: spacing.md },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  sheet: {
    gap: spacing.md,
    padding: spacing.lg,
    borderTopStartRadius: radii.xl,
    borderTopEndRadius: radii.xl,
    backgroundColor: colors.surface,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  breakOptions: { flexDirection: 'row', gap: spacing.sm },
  breakCard: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  ring: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 10,
    borderColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  ringDone: { borderColor: colors.success },
  breakIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningContainer,
  },
});
