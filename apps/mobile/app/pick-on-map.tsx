import type { LatLng } from '@fi-thnitek/contracts';
import { Camera, Map as MapView, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, type NativeSyntheticEvent, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_ZOOM, MAP_STYLE_URL, TUNIS_CENTER } from '../src/lib/map';
import { api } from '../src/lib/query';
import { DestinationPin, PIN_HEIGHT } from '../src/places/DestinationPin';
import { setDestination, useDestination } from '../src/places/destination';
import { distanceParts, langOf, placeNames } from '../src/places/format';
import { colors, radii, spacing } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
import { Text } from '../src/ui/Text';

/** ~11 m: reuses the answer while the map settles instead of asking again for every small move. */
const round = (v: number) => Math.round(v * 1e4) / 1e4;

/** "Pick on map" (R-011): a fixed centre pin, named after the closest known place. */
export default function PickOnMapScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const start = useDestination()?.point;
  const [center, setCenter] = useState<LatLng>(() => start ?? { lat: TUNIS_CENTER[1], lng: TUNIS_CENTER[0] });
  const point = { lat: round(center.lat), lng: round(center.lng) };

  const nearest = useQuery({
    queryKey: ['places', 'nearest', point.lat, point.lng],
    queryFn: () => api.nearestPlace({ point }),
    staleTime: 5 * 60_000,
  });

  function onRegionDidChange(e: NativeSyntheticEvent<ViewStateChangeEvent>) {
    const [lng, lat] = e.nativeEvent.center;
    setCenter({ lat, lng });
  }

  function confirm() {
    setDestination({
      point,
      place: nearest.data?.place ?? null,
      distanceM: nearest.data?.distanceM ?? null,
    });
    router.dismissTo('/home');
  }

  let label: string | null = null;
  if (nearest.data?.place) {
    const d = distanceParts(nearest.data.distanceM ?? 0);
    label = t('places.near', {
      name: placeNames(nearest.data.place, langOf(i18n.language)).name,
      distance: t(`places.${d.unit}`, { value: d.value }),
    });
  } else if (nearest.isSuccess) {
    label = t('places.noPlaceNearby');
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('places.pickTitle') }} />
      <MapView
        style={styles.flex}
        mapStyle={MAP_STYLE_URL}
        attribution
        logo={false}
        compass
        onRegionDidChange={onRegionDidChange}
      >
        <Camera initialViewState={{ center: [center.lng, center.lat], zoom: start ? 14 : DEFAULT_ZOOM }} />
      </MapView>

      {/* Lifted by its own height so the pin's tip sits exactly on the map centre. */}
      <View style={styles.pinLayer} pointerEvents="none">
        <View style={styles.pinOffset}>
          <DestinationPin />
        </View>
      </View>

      <View style={styles.hint} pointerEvents="none">
        <Text style={styles.hintText}>{t('places.pickHint')}</Text>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.labelRow} accessibilityLiveRegion="polite">
          {nearest.isFetching ? <ActivityIndicator color={colors.primary} /> : null}
          <Text variant="bodyStrong" style={styles.label}>
            {label ?? ' '}
          </Text>
        </View>
        <Button label={t('places.confirm')} onPress={confirm} disabled={nearest.isPending} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pinLayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  pinOffset: { marginBottom: PIN_HEIGHT },
  hint: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.onPrimaryContainer,
  },
  hintText: { color: colors.onPrimary },
  sheet: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    padding: spacing.md,
    gap: spacing.md,
    borderTopStartRadius: radii.lg,
    borderTopEndRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 24 },
  label: { flex: 1, textAlign: 'auto' },
});
