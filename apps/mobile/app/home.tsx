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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_ZOOM, MAP_STYLE_URL, TUNIS_CENTER } from '../src/lib/map';
import { DriverCard } from '../src/map/DriverCard';
import { DriverMarkers } from '../src/map/DriverMarkers';
import { useMapDrivers } from '../src/map/useMapDrivers';
import { bboxAround, bboxOf } from '../src/map/viewport';
import { DestinationPin } from '../src/places/DestinationPin';
import { type Layer, LayerChips } from '../src/places/LayerChips';
import { setDestination, useDestination } from '../src/places/destination';
import { langOf, placeNames } from '../src/places/format';
import { colors, radii, sizes, spacing } from '../src/theme/tokens';
import { Text } from '../src/ui/Text';

const ALL_LAYERS: readonly Layer[] = ['taxi', 'louage', 'bus', 'passengers'];
const LAYER_OF: Record<TransportType, Layer> = { TAXI: 'taxi', LOUAGE: 'louage', BUS: 'bus' };

/**
 * P1 Map home (R-020…R-022): search bar, layer toggles, the destination pin and the sharing drivers,
 * polled every 5 s while visible. Passenger requests arrive with Phase 6; no user location here yet.
 */
export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const destination = useDestination();
  const [layers, setLayers] = useState<ReadonlySet<Layer>>(() => new Set(ALL_LAYERS));
  const [bbox, setBbox] = useState(() => bboxAround(TUNIS_CENTER));
  const [selected, setSelected] = useState<MapDriver | null>(null);
  const live = useMapDrivers(bbox);
  const drivers = (live.data?.drivers ?? []).filter((d) => layers.has(LAYER_OF[d.type]));

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
        <Camera ref={camera} initialViewState={{ center: TUNIS_CENTER, zoom: DEFAULT_ZOOM }} />
        <DriverMarkers drivers={drivers} onSelect={setSelected} />
        {destination ? (
          <Marker lngLat={[destination.point.lng, destination.point.lat]} anchor="bottom">
            <DestinationPin />
          </Marker>
        ) : null}
      </MapView>

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.searchRow}>
          <Pressable
            accessibilityRole="search"
            accessibilityLabel={t('map.searchPlaceholder')}
            onPress={() => router.push('/destination')}
            style={styles.search}
          >
            <Text style={styles.searchIcon}>🔍</Text>
            <Text variant="bodyStrong" numberOfLines={1} style={styles.searchText}>
              {destinationName
                ? t('map.destinationTo', { name: destinationName })
                : t('map.searchPlaceholder')}
            </Text>
            {destination ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('map.clearDestination')}
                hitSlop={spacing.sm}
                onPress={() => setDestination(null)}
                style={styles.clear}
              >
                <Text muted>✕</Text>
              </Pressable>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('map.me')}
            onPress={() => router.push('/me')}
            style={styles.me}
          >
            <Text style={styles.meIcon}>👤</Text>
          </Pressable>
        </View>
        <LayerChips visible={layers} onToggle={toggle} />
      </View>

      <View style={[styles.bottom, { bottom: insets.bottom + spacing.xl }]} pointerEvents="box-none">
        {selected ? (
          <DriverCard driver={selected} onClose={() => setSelected(null)} />
        ) : live.data?.tooWide ? (
          <View style={styles.notice} pointerEvents="none">
            <Text muted style={styles.noticeText}>
              {t('live.zoomIn')}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
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
  top: { position: 'absolute', top: 0, start: 0, end: 0, gap: spacing.sm },
  searchRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
  search: {
    ...shadow,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.primaryButtonHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  searchIcon: { fontSize: 18 },
  searchText: { flex: 1, textAlign: 'auto' },
  clear: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  me: {
    ...shadow,
    width: sizes.primaryButtonHeight,
    height: sizes.primaryButtonHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meIcon: { fontSize: 22 },
  bottom: { position: 'absolute', start: spacing.md, end: spacing.md },
  notice: {
    ...shadow,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  noticeText: { textAlign: 'center' },
});
