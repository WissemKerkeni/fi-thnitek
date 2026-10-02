import { baseConfig } from '@fi-thnitek/config/eslint';

export default [
  ...baseConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // Nest resolves providers through emitted constructor metadata; type-only imports would erase them.
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
];
