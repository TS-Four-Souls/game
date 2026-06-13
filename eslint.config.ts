import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['**/*.test.ts'],
  },
  {
  files: ['**/*.{js,ts}'],
  extends: [tseslint.configs.base],
  languageOptions: {
    parserOptions: {
      projectService: true,
    },
  },
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
  },
  },
);
