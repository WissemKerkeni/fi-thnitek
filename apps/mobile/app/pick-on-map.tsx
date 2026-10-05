import type { LatLng } from '@fi-thnitek/contracts';
import { Camera, Map as MapView, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, type NativeSyntheticEvent, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_ZOOM, MAP_STYLE_URL, TUNIS_CENTER } from '../src/lib/map';
import { myPosition } from '../src/location/myPosition';
import { useAuth } from '../src/auth/AuthProvider';
import { DestinationPin, PIN_HEIGHT } from '../src/places/DestinationPin';
import { setDestination } from '../src/places/destination';
import {
  needsPlace,
  titleKey,
  useChoosePlace,
  usePlacePurpose,
  usePurposeStart,
} from '../src/places/purpose';
import { distanceParts, langOf, placeNames } from '../src/places/format';
import { colors, elevation, radii, spacing } from '../src/theme/tokens';
import { Icon } from '../src/ui/Icon';
import { Button } from '../src/ui/Button';
import { Text } from '../src/ui/Text';

/** ~11 m: reuses the answer while the map settles instead of asking again for every small move. */
const round = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * "Pick on map" (R-011): a fixed centre pin, named after the closest known place. With
 * `purpose` (heading-to, routine ends) the closest place is chosen instead (a known place is required).
 */
export default function PickOnMapScreen() {
  const { t, i18n } = useTranslation();
  const { api } = useAuth();
  const insets = useSafeAreaInsets();
  const purpose = usePlacePurpose();
  const choosePlace = useChoosePlace(purpose);
  // The current choice, else where the person is (ADR-224).
  const start = usePurposeStart(purpose) ?? myPosition();
  const placeOnly = needsPlace(purpose);
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
    if (placeOnly) {
      if (nearest.data?.place) choosePlace(nearest.data.place);
      // Back past the search screen to the one that asked.
      router.dismiss(2);
      return;
    }
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
      <Stack.Screen
        options={{ title: purpose === 'destination' ? t('places.pickTitle') : t(titleKey(purpose)) }}
      />
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
        <Icon name="gesture-swipe" size={18} color={colors.onPrimary} />
        <Text variant="caption" style={styles.hintText}>
          {t('places.pickHint')}
        </Text>
      </View>

      <View style={[styles.sheet, elevation, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.grabber} />
        <View style={styles.labelRow} accessibilityLiveRegion="polite">
          <View style={styles.pinIcon}>
            {nearest.isFetching ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Icon name="map-marker" color={colors.danger} />
            )}
          </View>
          <Text variant="bodyStrong" style={styles.label}>
            {label ?? ' '}
          </Text>
        </View>
        <Button
          icon="check"
          label={t('places.confirm')}
          onPress={confirm}
          disabled={nearest.isPending || (placeOnly && !nearest.data?.place)}
        />
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.text,
  },
  hintText: { color: colors.onPrimary },
  sheet: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    padding: spacing.md,
    gap: spacing.md,
    borderTopStartRadius: radii.xl,
    borderTopEndRadius: radii.xl,
    backgroundColor: colors.surface,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  pinIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerContainer,
  },
  label: { flex: 1, textAlign: 'auto' },
});
