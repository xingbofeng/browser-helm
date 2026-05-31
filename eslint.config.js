import js from '@eslint/js';
import i18next from 'eslint-plugin-i18next';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      i18next
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    }
  },
  {
    files: [
      'src/ui/**/*.tsx'
    ],
    rules: {
      'i18next/no-literal-string': ['warn', {
        framework: 'react',
        mode: 'jsx-text-only',
        words: {
          exclude: [
            '[0-9!-/:-@[-`{-~]+',
            /^[\p{P}\p{S}\s]+$/u,
            '[A-Z_-]+',
            '^BrowserHelm$',
            '^GitHub$',
            '^MIT License$',
            '^verify$',
            '^visible$',
            '^disabled$',
            '^required$',
            '^s$',
            '^\\[function\\]$',
            '^\\[unserializable\\]$'
          ]
        },
        callees: {
          exclude: [
            'L',
            't',
            'useT',
            'new URL',
            'String',
            'JSON.stringify',
            'document.querySelector',
            'document.querySelectorAll',
            'classList.add',
            'classList.remove',
            'setProperty',
            'localStorage.setItem',
            'getAttribute',
            'setAttribute'
          ]
        }
      }],
    }
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      'i18next/no-literal-string': 'off',
    }
  },
  {
    ignores: [
      '.output/**',
      '.wxt/**',
      '.vercel/**',
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'eslint.config.js',
      'public/page-health-hook.js'
    ]
  }
);
