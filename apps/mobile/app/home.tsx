import type { MapDriver, TransportType } from '@fi-thnitek/contracts';
import {
  Camera,
  type CameraRef,
  Map as MapView,
  Marker,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { Stack, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type NativeSyntheticEvent, Pressable, StyleSheet, View } from 'react-native';
import { DEFAULT_ZOOM, MAP_STYLE_URL, TUNIS_CENTER } from '../src/lib/map';
import { DriverCard } from '../src/map/DriverCard';
import { DriverMarkers } from '../src/map/DriverMarkers';
import { useMapDrivers } from '../src/map/useMapDrivers';
import { bboxAround, bboxOf } from '../src/map/viewport';
import { DestinationPin } from '../src/places/DestinationPin';
import { type Layer, LayerChips } from '../src/places/LayerChips';
import { setDestination, useDestination } from '../src/places/destination';
import { langOf, placeNames } from '../src/places/format';
import { colors, elevation, radii, spacing } from '../src/theme/tokens';
import { AppHeader } from '../src/ui/AppHeader';
import { BottomNav } from '../src/ui/BottomNav';
import { Icon } from '../src/ui/Icon';
import { IconButton } from '../src/ui/kit';
import { Text } from '../src/ui/Text';
import { useNow } from '../src/ui/useNow';

const ALL_LAYERS: readonly Layer[] = ['taxi', 'louage', 'bus', 'passengers'];
const LAYER_OF: Record<TransportType, Layer> = { TAXI: 'taxi', LOUAGE: 'louage', BUS: 'bus' };

/**
 * P1 Map home (R-020…R-022), as the Stitch "Map home" screen: top bar, search card, layer chips, the map
 * with live drivers (polled every 5 s while visible), a "live" freshness pill and the bottom navigation.
 * Passenger requests arrive with Phase 6; there is no user location on this screen yet.
 */
export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const camera = useRef<CameraRef>(null);
  const destination = useDestination();
  const now = useNow();
  const [layers, setLayers] = useState<ReadonlySet<Layer>>(() => new Set(ALL_LAYERS));
  const [bbox, setBbox] = useState(() => bboxAround(TUNIS_CENTER));
  const [selected, setSelected] = useState<MapDriver | null>(null);
  const live = useMapDrivers(bbox);
  const drivers = (live.data?.drivers ?? []).filter((d) => layers.has(LAYER_OF[d.type]));
  const updatedS = live.dataUpdatedAt ? Math.max(0, Math.round((now - live.dataUpdatedAt) / 1000)) : null;

  function onRegionDidChange(e: NativeSyntheticEvent<ViewStateChangeEvent>) {
    setBbox(bboxOf(e.nativeEvent.bounds));
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
          <Camera ref={camera} initialViewState={{ center: TUNIS_CENTER, zoom: DEFAULT_ZOOM }} />
          <DriverMarkers drivers={drivers} onSelect={setSelected} />
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
          {selected ? (
            <DriverCard driver={selected} onClose={() => setSelected(null)} />
          ) : live.data?.tooWide ? (
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

const styles = StyleSheet.create({
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
