import { baseConfig } from '@fi-thnitek/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  ...baseConfig({ tsconfigRootDir: import.meta.dirname }),
  reactHooks.configs.flat.recommended,
  { languageOptions: { globals: { ...globals.browser } } },
];
