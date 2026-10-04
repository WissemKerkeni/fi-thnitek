import { Linking } from 'react-native';

/**
 * Hands a passenger's spot to the driver's own navigation app (Google Maps or Waze) through their local
 * app schemes on the phone; Fi thnitek's servers never see these links (CLAUDE.md rule 8 is about our
 * URLs and logs). Falls back to the generic `geo:` intent (any installed maps app).
 */
export async function openNavigation(app: 'google' | 'waze', lat: number, lng: number): Promise<void> {
  const target = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const url = app === 'google' ? `google.navigation:q=${target}` : `waze://?ll=${target}&navigate=yes`;
  try {
    await Linking.openURL(url);
  } catch {
    await Linking.openURL(`geo:${target}?q=${target}`).catch(() => undefined);
  }
}
