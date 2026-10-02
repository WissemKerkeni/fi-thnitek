import { Camera, Map as MapView } from '@maplibre/maplibre-react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { DEFAULT_ZOOM, MAP_STYLE_URL, TUNIS_CENTER } from '../src/lib/map';

/** Phase 1 base map only: no user location, no markers yet. */
export default function MapScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('map.title') }} />
      <MapView style={styles.flex} mapStyle={MAP_STYLE_URL} attribution logo={false} compass>
        <Camera initialViewState={{ center: TUNIS_CENTER, zoom: DEFAULT_ZOOM }} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
