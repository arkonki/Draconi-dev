import js from '@eslint/js';
import globals from 'globals';
import reactRecommended from 'eslint-plugin-react/configs/recommended.js';
import jsxA11yRecommended from 'eslint-plugin-jsx-a11y/flat_config.js'; // Use flat config import
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.stackblitz', '.bolt'] },
  js.configs.recommended,
  ...tseslint.configs.recommended, // This should now work with ESLint 9 and TS-ESLint 8
  // React specific configurations
  {
    files: ['**/*.{ts,tsx}'],
    ...reactRecommended,
    settings: {
      react: {
        version: 'detect',
      },
    },
    languageOptions: {
      ...reactRecommended.languageOptions,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'react-refresh': reactRefresh,
      // react plugin is included via reactRecommended spread
      // jsx-a11y plugin is included via jsxA11yRecommended spread below
    },
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Hook rules might be included in reactRecommended or tseslint.configs.recommended now
      // If you encounter hook-related linting issues later, we may need to adjust rules here.
    },
  },
  // Accessibility configuration
  {
    files: ['**/*.{ts,tsx}'],
    ...jsxA11yRecommended,
  }
);
