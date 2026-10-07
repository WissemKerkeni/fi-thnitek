import type { RequestView } from '@fi-thnitek/contracts';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { setDestination } from '../../src/places/destination';
import { langOf, placeNames } from '../../src/places/format';
import { setNextRequestOptions } from '../../src/requests/draft';
import { requestErrorMessage, useCurrentRequest, useRequestActions } from '../../src/requests/useRequest';
import { colors, radii, spacing } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Icon, type IconName } from '../../src/ui/Icon';
import { Badge, Banner, Card, StatusPill } from '../../src/ui/kit';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';

/** P4 (Stitch "Active Ride") while a request is open, P5 (Stitch "Request closed") once it closes. */
export default function RequestScreen() {
  const { t } = useTranslation();
  const current = useCurrentRequest();

  if (!current.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('requests.navTab') }} />
        {current.isError ? (
          <Banner icon="wifi-off" tone="danger">
            {t('common.error')}
          </Banner>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </Screen>
    );
  }
  const { request, lastClosed } = current.data;
  if (request) return <ActiveView request={request} />;
  if (lastClosed) return <ClosedView request={lastClosed} />;
  return (
    <Screen>
      <Stack.Screen options={{ title: t('requests.navTab') }} />
      <View style={styles.empty}>
        <Icon name="map-search-outline" size={56} color={colors.textMuted} />
        <Text muted style={styles.center}>
          {t('requests.empty')}
        </Text>
      </View>
      <Button
        label={t('requests.chooseDestination')}
        icon="magnify"
        onPress={() => router.replace('/destination')}
      />
    </Screen>
  );
}

function useLabels(r: RequestView) {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  return {
    types: r.types.map((type) => t(`requests.type_${type}`)).join(t('requests.or')),
    destination: r.destination.place ? placeNames(r.destination.place, lang).name : t('places.pinnedPoint'),
  };
}

// ---------- P4 · Active request ----------

function ActiveView({ request: r }: { request: RequestView }) {
  const { t } = useTranslation();
  const labels = useLabels(r);
  const { cancel } = useRequestActions();
  const showError = (error: unknown) => Alert.alert(t('requests.activeTitle'), requestErrorMessage(t, error));

  function confirmCancel() {
    Alert.alert(t('requests.cancelConfirm'), undefined, [
      { text: t('requests.keep'), style: 'cancel' },
      {
        text: t('requests.cancel'),
        style: 'destructive',
        onPress: () => cancel.mutate(undefined, { onError: showError }),
      },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('requests.activeTitle') }} />

      <Card style={styles.hero}>
        <View style={[styles.pulse, r.anchored ? styles.pulseOn : styles.pulseWait]}>
          <Icon
            name={r.anchored ? 'access-point' : 'crosshairs-question'}
            size={40}
            color={r.anchored ? colors.success : colors.warning}
          />
        </View>
        <StatusPill label={r.anchored ? t('requests.visible') : t('requests.waitingGps')} on={r.anchored} />
        <Text variant="title" style={styles.center}>
          {t('requests.lookingFor', labels)}
        </Text>
        <View style={styles.badges}>
          <Badge label={`${r.seats} ${t('driver.seats')}`} icon="seat-passenger" />
          <Badge
            label={r.showIdentity ? t('requests.named') : t('requests.anonymous')}
            icon={r.showIdentity ? 'account-eye' : 'incognito'}
            tone={r.showIdentity ? 'info' : 'success'}
          />
        </View>
        {r.showIdentity && r.note ? (
          <Text muted style={styles.center}>
            “{r.note}”
          </Text>
        ) : null}
      </Card>

      <View style={styles.zone}>
        <View style={styles.zoneIcon}>
          <Icon name="map-marker-radius" size={28} color={colors.warning} />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyStrong" style={styles.warningText}>
            {t('requests.zoneTitle')}
          </Text>
          <Text style={styles.warningText}>{t('requests.zoneBody')}</Text>
        </View>
      </View>

      <Button
        label={t('requests.cancel')}
        icon="close"
        variant="danger"
        loading={cancel.isPending}
        onPress={confirmCancel}
      />
      <Button
        label={t('requests.backToMap')}
        icon="map"
        variant="secondary"
        onPress={() => router.replace('/home')}
      />
    </Screen>
  );
}

// ---------- P5 · Request closed ----------

const CLOSED_ICON: Record<Exclude<RequestView['status'], 'OPEN'>, IconName> = {
  MOVED_AWAY: 'walk',
  LOCATION_LOST: 'map-marker-off-outline',
  NO_GPS_FIX: 'crosshairs-off',
  EXPIRED: 'timer-off-outline',
  CANCELLED: 'close-circle-outline',
  REMOVED: 'shield-alert-outline',
};

function ClosedView({ request: r }: { request: RequestView }) {
  const { t } = useTranslation();
  const status = r.status === 'OPEN' ? 'CANCELLED' : r.status;
  const happy = status === 'MOVED_AWAY';

  function postAgain() {
    setDestination({
      point: r.destination.point,
      place: r.destination.place,
      distanceM: r.destination.place ? 0 : null,
    });
    setNextRequestOptions({
      types: r.types,
      seats: r.seats,
      note: r.note ?? '',
      showIdentity: r.showIdentity,
    });
    router.replace('/request/new');
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('requests.navTab') }} />
      <Card style={styles.hero}>
        <View style={[styles.pulse, happy ? styles.pulseOn : styles.pulseClosed]}>
          <Icon name={CLOSED_ICON[status]} size={44} color={happy ? colors.success : colors.textMuted} />
        </View>
        <Text variant="title" style={styles.center}>
          {t(`requests.closedTitle_${status}`)}
        </Text>
        <Text muted style={styles.center}>
          {t(`requests.closedBody_${status}`)}
        </Text>
      </Card>
      <Button label={t('requests.postAgain')} icon="bullhorn-outline" onPress={postAgain} />
      <Button
        label={t('requests.backToMap')}
        icon="map"
        variant="secondary"
        onPress={() => router.replace('/home')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  pulse: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
  },
  pulseOn: { backgroundColor: colors.successContainer, borderColor: colors.success },
  pulseWait: { backgroundColor: colors.warningContainer, borderColor: colors.warning },
  pulseClosed: { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  zone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.warningContainer,
  },
  zoneIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  warningText: { color: colors.warning },
});
