// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      // JUNO-06 PR E: canonical Android-131 artifact rules, a plain .mjs
      // data/logic module executed by Node (test fixtures + the CLI
      // inspector). eslint-config-expo applies its TypeScript rules to
      // project .mjs files without the plugin in scope, which crashes
      // `expo lint` — and this file carries no app code, so linting it
      // guards nothing. Its behavior is pinned by
      // src/__tests__/android-131-release.test.ts instead.
      'src/release/*.mjs',
    ],
  },
  {
    rules: {
      // Allow unused vars prefixed with _
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Downgrade exhaustive-deps to warning (intentional empty deps for "run once")
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]);
