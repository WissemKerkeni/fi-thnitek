import { I18nManager } from 'react-native';

/** "→" in text, pointing the reading way: Unicode arrows are not mirrored in Arabic (RTL) text. */
export function arrow(): string {
  return I18nManager.isRTL ? '←' : '→';
}
