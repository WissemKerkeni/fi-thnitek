import type { MapDriver, SharingStatus } from '@fi-thnitek/contracts';
import {
  Camera,
  Map as MapView,
  UserLocation,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_ZOOM, MAP_STYLE_URL, TUNIS_CENTER } from '../src/lib/map';
import { DriverCard } from '../src/map/DriverCard';
import { DriverMarkers, TYPE_ICON } from '../src/map/DriverMarkers';
import { useMapDrivers } from '../src/map/useMapDrivers';
import { bboxAround, bboxOf } from '../src/map/viewport';
import { langOf, placeNames } from '../src/places/format';
import { setHeadingTo, useHeadingTo } from '../src/sharing/headingTo';
import { breakLabel, clockTime, countdown } from '../src/sharing/time';
import { useChooseHeading } from '../src/sharing/useChooseHeading';
import {
  SharingSetupError,
  sharingErrorMessage,
  useSharingActions,
  useSharingStatus,
} from '../src/sharing/useSharing';
import { colors, radii, sizes, spacing } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Text } from '../src/ui/Text';
import { TextField } from '../src/ui/TextField';
import { useNow } from '../src/ui/useNow';

/** The driver home: D3 "Start sharing", D4 the live map while sharing, and the break screen (R-050…R-058). */
export default function SharingScreen() {
  const { t } = useTranslation();
  const status = useSharingStatus();

  if (!status.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('sharing.title') }} />
        {status.isError ? (
          <>
            <Text>{t('common.error')}</Text>
            <Button label={t('common.retry')} onPress={() => void status.refetch()} />
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
  const [line, setLine] = useState('');
  const { start } = useSharingActions();
  const showError = useErrorAlert();
  const isBus = status.vehicle?.transportType === 'BUS';
  const cooldownLeft = status.cooldownUntil && new Date(status.cooldownUntil).getTime() > now;
  const hardBlockers = status.blockers.filter((b) => b !== 'COOLDOWN');
  const recentEnd =
    status.lastEnded && now - new Date(status.lastEnded.endedAt).getTime() < 12 * 3_600_000
      ? status.lastEnded
      : null;

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: t('sharing.startTitle'),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('map.me')}
              onPress={() => router.push('/me')}
            >
              <Text style={styles.meIcon}>👤</Text>
            </Pressable>
          ),
        }}
      />
      {status.vehicle ? (
        <View style={styles.card}>
          <Text muted>{t('sharing.vehicle')}</Text>
          <View style={styles.row}>
            <Text style={styles.bigIcon}>{TYPE_ICON[status.vehicle.transportType]}</Text>
            <View style={styles.flex}>
              <Text variant="bodyStrong" style={styles.start}>
                {t(`driver.type_${status.vehicle.transportType}`)}
              </Text>
              <Text style={styles.start}>{status.vehicle.plateDisplay}</Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text muted>{t('sharing.headingTo')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/destination', params: { purpose: 'heading' } })}
          style={styles.row}
        >
          <Text style={styles.bigIcon}>📍</Text>
          <Text variant="bodyStrong" style={[styles.flex, styles.start, !headingTo && styles.link]}>
            {headingTo ? placeNames(headingTo, lang).name : t('sharing.headingToChoose')}
          </Text>
          {headingTo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('sharing.headingToClear')}
              hitSlop={spacing.sm}
              onPress={() => setHeadingTo(null)}
            >
              <Text muted>✕</Text>
            </Pressable>
          ) : null}
        </Pressable>
        {!headingTo ? <Text muted>{t('sharing.headingToNone')}</Text> : null}
      </View>

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

      {recentEnd ? (
        <Text style={styles.notice}>
          {t('sharing.lastEnded', { reason: t(`sharing.reason_${recentEnd.reason}`) })}
        </Text>
      ) : null}
      {cooldownLeft && status.cooldownUntil ? (
        <View style={[styles.card, styles.warnCard]} accessibilityLiveRegion="polite">
          <Text variant="bodyStrong">
            {t('sharing.cooldown', { time: clockTime(status.cooldownUntil, lang) })}
          </Text>
          <Text variant="title">{countdown(status.cooldownUntil, now)}</Text>
        </View>
      ) : null}
      {hardBlockers.map((b) => (
        <Text key={b} style={styles.notice}>
          {t(`sharing.blocker_${b}`)}
        </Text>
      ))}
      {hardBlockers.includes('NOT_VERIFIED') || hardBlockers.includes('NO_VEHICLE') ? (
        <Button
          label={t('sharing.myFile')}
          variant="secondary"
          onPress={() => router.push('/driver/status')}
        />
      ) : null}

      <Text muted>{t('sharing.startHint')}</Text>
      <Button
        label={t('sharing.start')}
        variant="accent"
        loading={start.isPending}
        disabled={hardBlockers.length > 0 || !!cooldownLeft}
        onPress={() =>
          start.mutate(
            { headingToPlaceId: headingTo?.id ?? null, lineLabel: isBus && line.trim() ? line.trim() : null },
            { onError: showError },
          )
        }
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
  const [breakOpen, setBreakOpen] = useState(false);
  // R-025: drivers see each other while sharing with a fresh fix (else the API answers 403).
  const drivers = useMapDrivers(bbox, s.fresh);

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
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: false }} />
      <MapView
        style={styles.flex}
        mapStyle={MAP_STYLE_URL}
        attribution
        logo={false}
        compass
        onRegionDidChange={onRegionDidChange}
      >
        <Camera initialViewState={{ center: TUNIS_CENTER, zoom: DEFAULT_ZOOM }} trackUserLocation="default" />
        <UserLocation accuracy heading />
        <DriverMarkers drivers={drivers.data?.drivers ?? []} onSelect={setSelected} />
      </MapView>

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.topRow}>
          <View
            style={[styles.statusPill, s.fresh ? styles.statusOk : styles.statusWarn]}
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.statusDot}>{s.fresh ? '●' : '…'}</Text>
            <Text variant="label" numberOfLines={2} style={[styles.flex, styles.start]}>
              {s.fresh ? t('sharing.visible') : t('sharing.reconnecting')}
            </Text>
            {s.isFull ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t('sharing.fullBadge')}</Text>
              </View>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('map.me')}
            onPress={() => router.push('/me')}
            style={styles.roundButton}
          >
            <Text style={styles.meIcon}>👤</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/destination', params: { purpose: 'heading' } })}
          style={styles.headingChip}
        >
          <Text numberOfLines={1} style={[styles.flex, styles.start]}>
            📍{' '}
            {s.headingTo
              ? t('live.headingTo', { name: placeNames(s.headingTo, lang).name })
              : t('sharing.headingToChoose')}
          </Text>
          {s.headingTo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('sharing.headingToClear')}
              hitSlop={spacing.sm}
              onPress={() => void chooseHeading(null).catch(showError)}
            >
              <Text muted>✕</Text>
            </Pressable>
          ) : null}
        </Pressable>
        {drivers.data?.tooWide ? <Text style={styles.zoomHint}>{t('live.zoomIn')}</Text> : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
        {selected ? <DriverCard driver={selected} onClose={() => setSelected(null)} /> : null}
        <View style={styles.sheet}>
          <Button
            label={s.isFull ? t('sharing.available') : t('sharing.imFull')}
            variant={s.isFull ? 'secondary' : 'accent'}
            loading={setFull.isPending}
            onPress={() => setFull.mutate(!s.isFull, { onError: showError })}
          />
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button
                label={t('sharing.break')}
                variant="secondary"
                loading={takeBreak.isPending}
                onPress={() => setBreakOpen(true)}
              />
            </View>
            <View style={styles.flex}>
              <Button
                label={t('sharing.stop')}
                variant="secondary"
                loading={stop.isPending}
                onPress={confirmStop}
              />
            </View>
          </View>
        </View>
      </View>

      <Modal transparent visible={breakOpen} animationType="fade" onRequestClose={() => setBreakOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setBreakOpen(false)}>
          <Pressable style={styles.modal} onPress={() => undefined}>
            <Text variant="title">{t('sharing.breakTitle')}</Text>
            <Text muted>{t('sharing.breakHint')}</Text>
            {status.breakOptionsMin.map((minutes) => {
              const label = breakLabel(minutes);
              return (
                <Button
                  key={minutes}
                  label={
                    label.key === 'sharing.breakHours'
                      ? t(label.key, { hours: label.value })
                      : t(label.key, { minutes: label.value })
                  }
                  onPress={() => {
                    setBreakOpen(false);
                    takeBreak.mutate(minutes, { onError: showError });
                  }}
                />
              );
            })}
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

  return (
    <Screen>
      <Stack.Screen options={{ title: t('sharing.title') }} />
      <View style={[styles.card, styles.breakCard]} accessibilityLiveRegion="polite">
        <Text style={styles.bigIcon}>☕</Text>
        <Text variant="title">{t('sharing.onBreakUntil', { time: clockTime(until, lang) })}</Text>
        {!over ? <Text variant="title">{countdown(until, now)}</Text> : null}
        <Text muted>{t('sharing.breakHint')}</Text>
      </View>
      {over && s.resumeDeadline ? (
        <Text style={styles.notice}>
          {t('sharing.resumeBefore', { time: clockTime(s.resumeDeadline, lang) })}
        </Text>
      ) : (
        <Text muted>{t('sharing.resumeAt', { time: clockTime(until, lang) })}</Text>
      )}
      <Button
        label={t('sharing.resume')}
        variant="accent"
        disabled={!over}
        loading={resume.isPending}
        onPress={() => resume.mutate(undefined, { onError: showError })}
      />
      <Button
        label={t('sharing.stop')}
        variant="secondary"
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

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  start: { textAlign: 'auto' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.minTouchTarget },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  warnCard: { borderColor: colors.warning },
  breakCard: { alignItems: 'center' },
  bigIcon: { fontSize: 28 },
  meIcon: { fontSize: 22 },
  link: { color: colors.primary },
  notice: { color: colors.warning, fontWeight: '600' },
  top: { position: 'absolute', top: 0, start: 0, end: 0, gap: spacing.sm, paddingHorizontal: spacing.md },
  topRow: { flexDirection: 'row', gap: spacing.sm },
  statusPill: {
    ...shadow,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.primaryButtonHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 2,
    backgroundColor: colors.surface,
  },
  statusOk: { borderColor: colors.success },
  statusWarn: { borderColor: colors.warning },
  statusDot: { color: colors.success, fontSize: 18 },
  badge: { borderRadius: radii.sm, paddingHorizontal: spacing.sm, backgroundColor: colors.textMuted },
  badgeText: { color: colors.onStatus, fontWeight: '700' },
  roundButton: {
    ...shadow,
    width: sizes.primaryButtonHeight,
    height: sizes.primaryButtonHeight,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  headingChip: {
    ...shadow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.minTouchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  zoomHint: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    color: colors.onPrimary,
    backgroundColor: colors.onPrimaryContainer,
  },
  bottom: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sheet: {
    ...shadow,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modal: {
    gap: spacing.md,
    padding: spacing.lg,
    borderTopStartRadius: radii.lg,
    borderTopEndRadius: radii.lg,
    backgroundColor: colors.surface,
  },
});
