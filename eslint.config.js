import js from '@eslint/js';
import globals from 'globals';
import reactRecommended from 'eslint-plugin-react/configs/recommended.js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.stackblitz', '.bolt', 'dev-dist'] },
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
    },
    rules: {
      'react-refresh/only-export-components': [
        'error',
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
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ['src/components/admin/**/*.{ts,tsx}'],
    rules: {
      'jsx-a11y/label-has-associated-control': 'off',
      'no-prototype-builtins': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    files: ['src/components/settings/**/*.{ts,tsx}'],
    rules: {
      'jsx-a11y/label-has-associated-control': 'off',
    },
  },
  {
    files: [
      'src/hooks/**/*.{ts,tsx}',
      'src/lib/**/*.{ts,tsx}',
      'src/stores/**/*.{ts,tsx}',
      'src/types/**/*.{ts,tsx}',
      'src/data/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    files: ['src/sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },
  {
    files: ['tailwind.config.js', 'postcss.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        require: 'readonly',
        module: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
    },
  }
);
