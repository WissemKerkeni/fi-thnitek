import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LOCALE, type Locale, isLocale, isRtl, resolveLocale, resources } from '@fi-thnitek/i18n';
import { getLocales } from 'expo-localization';
import * as Updates from 'expo-updates';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';

const STORAGE_KEY = 'fi-thnitek.locale';

export async function loadSavedLocale(): Promise<Locale | null> {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  return isLocale(saved) ? saved : null;
}

export async function initI18n(): Promise<Locale> {
  const locale = (await loadSavedLocale()) ?? resolveLocale(getLocales()[0]?.languageTag);
  await i18next.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  I18nManager.allowRTL(true);
  return locale;
}

/**
 * Saves the choice and switches language. React Native only applies a layout-direction change after a
 * reload, so switching between Arabic (RTL) and French (LTR) reloads the app.
 */
export async function chooseLocale(locale: Locale): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, locale);
  await i18next.changeLanguage(locale);
  const rtl = isRtl(locale);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    await Updates.reloadAsync();
  }
}

export { i18next };
