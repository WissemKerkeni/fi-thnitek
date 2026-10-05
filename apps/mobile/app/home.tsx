import type { MapDriver, TransportType } from '@fi-thnitek/contracts';
import {
  Camera,
  type CameraRef,
  Map as MapView,
  Marker,
  type ViewStateChangeEvent,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type NativeSyntheticEvent, Pressable, StyleSheet, View } from 'react-native';
import { DEFAULT_ZOOM, MAP_STYLE_URL, TUNIS_CENTER } from '../src/lib/map';
import { DriverCard } from '../src/map/DriverCard';
import { DriverMarkers } from '../src/map/DriverMarkers';
import { ClusterMarkers, PassengerMarkers } from '../src/map/PassengerMarkers';
import { useAnimatedPositions } from '../src/map/useAnimatedPositions';
import { useLiveMap } from '../src/map/useLiveMap';
import { setMapCenter } from '../src/map/mapCenter';
import { bboxAround, bboxOf } from '../src/map/viewport';
import { refreshPosition, useMyPosition } from '../src/location/myPosition';
import { DestinationPin } from '../src/places/DestinationPin';
import { type Layer, LayerChips } from '../src/places/LayerChips';
import { setDestination, useDestination } from '../src/places/destination';
import { useCurrentRequest } from '../src/requests/useRequest';
import { langOf, placeNames } from '../src/places/format';
import { colors, elevation, radii, spacing } from '../src/theme/tokens';
import { AppHeader } from '../src/ui/AppHeader';
import { BottomNav } from '../src/ui/BottomNav';
import { Icon } from '../src/ui/Icon';
import { Button } from '../src/ui/Button';
import { IconButton, StatusPill } from '../src/ui/kit';
import { Text } from '../src/ui/Text';
import { useNow } from '../src/ui/useNow';

const ALL_LAYERS: readonly Layer[] = ['taxi', 'louage', 'bus', 'passengers'];
const LAYER_OF: Record<TransportType, Layer> = { TAXI: 'taxi', LOUAGE: 'louage', BUS: 'bus' };

/**
 * P1 Map home (R-020…R-022), as the Stitch "Map home" screen: top bar, search card, layer chips, the map
 * with live drivers (polled every 5 s while visible), a "live" freshness pill and the bottom navigation.
 * It opens where the person is (ADR-224: read on the phone, never sent with the map polls).
 */
export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const camera = useRef<CameraRef>(null);
  const destination = useDestination();
  const me = useMyPosition();
  const [start] = useState(() => me);
  const centredOnMe = useRef(start !== null);
  const now = useNow();
  const [layers, setLayers] = useState<ReadonlySet<Layer>>(() => new Set(ALL_LAYERS));
  const [bbox, setBbox] = useState(() => bboxAround(start ? [start.lng, start.lat] : TUNIS_CENTER));
  const [selected, setSelected] = useState<MapDriver | null>(null);
  const live = useLiveMap(bbox);
  const current = useCurrentRequest();
  const open = current.data?.request ?? null;
  const visibleDrivers = useMemo(
    () => (live.data?.drivers ?? []).filter((d) => layers.has(LAYER_OF[d.type])),
    [live.data, layers],
  );
  const drivers = useAnimatedPositions(visibleDrivers);
  const passengers = layers.has('passengers') ? (live.data?.passengers ?? []) : [];
  const updatedS = live.dataUpdatedAt ? Math.max(0, Math.round((now - live.dataUpdatedAt) / 1000)) : null;

  function onRegionDidChange(e: NativeSyntheticEvent<ViewStateChangeEvent>) {
    setBbox(bboxOf(e.nativeEvent.bounds));
    const [lng, lat] = e.nativeEvent.center;
    setMapCenter({ lat, lng });
  }

  // The position may arrive after the map: go there once, unless the person is looking at a destination.
  useEffect(() => {
    if (me && !centredOnMe.current && !destination) {
      centredOnMe.current = true;
      camera.current?.flyTo({ center: [me.lng, me.lat], zoom: MY_ZOOM, duration: 600 });
    }
  }, [me, destination]);

  async function locateMe() {
    const p = (await refreshPosition()) ?? me;
    if (p) camera.current?.flyTo({ center: [p.lng, p.lat], zoom: MY_ZOOM, duration: 600 });
  }

  useEffect(() => {
    if (destination) {
      camera.current?.flyTo({
        center: [destination.point.lng, destination.point.lat],
        zoom: 13,
        duration: 800,
      });
    }
  }, [destination]);

  function toggle(layer: Layer) {
    setLayers((prev) => {
      const next = new Set(prev);
      if (!next.delete(layer)) next.add(layer);
      return next;
    });
  }

  const destinationName = destination
    ? destination.place && destination.distanceM === 0
      ? placeNames(destination.place, langOf(i18n.language)).name
      : t('places.pinnedPoint')
    : null;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader title={t('app.name')} subtitle={t('map.title')} showProfile />

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
            ref={camera}
            initialViewState={{
              center: start ? [start.lng, start.lat] : TUNIS_CENTER,
              zoom: start ? MY_ZOOM : DEFAULT_ZOOM,
            }}
          />
          <UserLocation accuracy />
          <DriverMarkers drivers={drivers} onSelect={setSelected} />
          <PassengerMarkers passengers={passengers} />
          <ClusterMarkers
            clusters={live.data?.clusters ?? []}
            onPress={(c) => camera.current?.flyTo({ center: [c.lng, c.lat], zoom: 11, duration: 600 })}
          />
          {destination ? (
            <Marker lngLat={[destination.point.lng, destination.point.lat]} anchor="bottom">
              <DestinationPin />
            </Marker>
          ) : null}
        </MapView>

        <View style={styles.top} pointerEvents="box-none">
          <View style={[styles.search, elevation]}>
            <Pressable
              accessibilityRole="search"
              accessibilityLabel={t('map.searchPlaceholder')}
              onPress={() => router.push('/destination')}
              style={styles.searchTap}
            >
              <View style={styles.searchIcon}>
                <Icon name="magnify" color={colors.onPrimary} />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {destinationName
                    ? t('map.destinationTo', { name: destinationName })
                    : t('map.searchPlaceholder')}
                </Text>
                {!destinationName ? (
                  <Text variant="caption" muted numberOfLines={1}>
                    {t('map.searchExamples')}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            {destination ? (
              <IconButton
                icon="close"
                label={t('map.clearDestination')}
                variant="tonal"
                onPress={() => setDestination(null)}
              />
            ) : (
              <IconButton
                icon="map-marker-radius"
                label={t('places.pickOnMap')}
                variant="tonal"
                onPress={() => router.push('/pick-on-map')}
              />
            )}
          </View>
          <LayerChips visible={layers} onToggle={toggle} />
        </View>

        <View style={styles.bottom} pointerEvents="box-none">
          <View style={styles.locate} pointerEvents="box-none">
            <IconButton
              icon="crosshairs-gps"
              label={t('location.locateMe')}
              floating
              onPress={() => void locateMe()}
            />
          </View>
          {open ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/request')}
              style={[styles.requestCard, elevation]}
            >
              <View style={styles.requestIcon}>
                <Icon name="bullhorn-outline" color={colors.onPrimary} />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong">{t('requests.activeTitle')}</Text>
                <StatusPill
                  label={open.anchored ? t('requests.visible') : t('requests.waitingGps')}
                  on={open.anchored}
                />
              </View>
              <Icon name="chevron-right" color={colors.textMuted} />
            </Pressable>
          ) : null}
          {!open && destination && !selected ? (
            <>
              <Button
                label={t('finder.title', { name: destinationName ?? '' })}
                icon="account-search"
                variant="secondary"
                onPress={() => router.push('/finder')}
              />
              <Button
                label={t('requests.ask')}
                subtitle={t('requests.askSubtitle')}
                icon="hail"
                onPress={() => router.push('/request/new')}
              />
            </>
          ) : null}
          {selected ? (
            <DriverCard driver={selected} onClose={() => setSelected(null)} />
          ) : live.data?.clustered ? (
            <View style={styles.livePill} pointerEvents="none">
              <Icon name="magnify-plus-outline" size={18} color={colors.onPrimary} />
              <Text variant="caption" style={styles.livePillText}>
                {t('live.zoomIn')}
              </Text>
            </View>
          ) : updatedS !== null && live.isSuccess ? (
            <View style={styles.livePill} pointerEvents="none" accessibilityLiveRegion="polite">
              <View style={styles.liveDot} />
              <Text variant="caption" style={styles.livePillText}>
                {t('live.liveUpdated', { value: updatedS })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <BottomNav
        active="map"
        items={[
          { key: 'map', icon: 'map', label: t('live.navMap'), onPress: () => undefined },
          {
            key: 'request',
            icon: 'bullhorn-outline',
            label: t('requests.navTab'),
            onPress: () => router.push('/request'),
          },
          {
            key: 'me',
            icon: 'account-circle-outline',
            label: t('live.navMe'),
            onPress: () => router.push('/me'),
          },
        ]}
      />
    </View>
  );
}

/** Street level around the person (~1 km across). */
const MY_ZOOM = 15;

const styles = StyleSheet.create({
  locate: { alignItems: 'flex-end' },
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  top: { position: 'absolute', top: spacing.sm, start: 0, end: 0, gap: spacing.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  searchTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  searchIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  bottom: {
    position: 'absolute',
    start: spacing.md,
    end: spacing.md,
    bottom: spacing.md,
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  requestIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  livePill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.text,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80' },
  livePillText: { color: colors.onPrimary },
});
