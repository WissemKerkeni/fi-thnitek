import { existsSync } from 'node:fs';
import type { ExpoConfig } from 'expo/config';

/**
 * FCM client config from Firebase (kept out of git). EAS builds get it from the GOOGLE_SERVICES_JSON file
 * variable (`eas env:create --type file`); local builds use ./google-services.json. Without it, no push.
 */
const LOCAL_GOOGLE_SERVICES = './google-services.json';
const GOOGLE_SERVICES =
  process.env.GOOGLE_SERVICES_JSON ?? (existsSync(LOCAL_GOOGLE_SERVICES) ? LOCAL_GOOGLE_SERVICES : undefined);

const config: ExpoConfig = {
  name: 'Fi thnitek',
  slug: 'fi-thnitek',
  owner: 'wissemkerkeni',
  scheme: 'fithnitek',
  version: '0.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  android: {
    package: 'tn.fithnitek.app',
    ...(GOOGLE_SERVICES && { googleServicesFile: GOOGLE_SERVICES }),
    // CLAUDE.md rule 7: location only while in use, inside user-started foreground services with a
    // visible notification. Background location is never requested, even if a library adds it.
    blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'],
  },
  ios: { bundleIdentifier: 'tn.fithnitek.app', supportsTablet: false },
  plugins: [
    'expo-router',
    'expo-localization',
    '@maplibre/maplibre-react-native',
    '@react-native-google-signin/google-signin',
    // Keeps the refresh token out of Android backups.
    ['expo-secure-store', { configureAndroidBackup: true }],
    [
      'expo-image-picker',
      {
        cameraPermission: 'Fi thnitek uses the camera to photograph your verification documents.',
        microphonePermission: false,
      },
    ],
    'expo-notifications',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Fi thnitek shows your position to passengers only while you choose to share it.',
        // Adds FOREGROUND_SERVICE + FOREGROUND_SERVICE_LOCATION for the "You're visible" service (R-052).
        isAndroidForegroundServiceEnabled: true,
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
  ],
  extra: {
    // Lets I18nManager.forceRTL take effect for Arabic.
    supportsRTL: true,
    eas: { projectId: '67797ce6-5517-4556-8f7a-32459c495610' },
  },
  experiments: { typedRoutes: true },
};

export default config;
