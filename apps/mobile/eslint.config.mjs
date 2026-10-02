import { baseConfig } from '@fi-thnitek/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', '.expo/**', 'expo-env.d.ts'] },
  ...baseConfig({ tsconfigRootDir: import.meta.dirname }),
  reactHooks.configs.flat.recommended,
];
