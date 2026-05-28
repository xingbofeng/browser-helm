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
      'i18next/no-literal-string': ['warn', {
        mode: 'all',
        'ignore-attribute': ['className', 'class', 'type', 'name', 'id', 'role', 'aria-label',
          'aria-describedby', 'aria-labelledby', 'dataTestId', 'data-testid', 'testID',
          'testId', 'placeholder', 'label', 'title', 'htmlFor', 'for', 'href', 'src',
          'alt', 'target', 'rel', 'key', 'onClick', 'onChange', 'onSubmit', 'onKeyDown',
          'onKeyUp', 'onBlur', 'onFocus', 'onMouseDown', 'onMouseUp', 'onMouseEnter',
          'onMouseLeave', 'style', 'variant', 'size', 'color', 'fill', 'stroke',
          'width', 'height', 'viewBox', 'xmlns', 'd', 'path', 'clipRule', 'fillRule',
          'strokeWidth', 'strokeLinecap', 'strokeLinejoin',
          'appearance', 'tone', 'icon', 'status',
        ],
        'ignore-attribute-value': [
          'bh-', 'is-',
          'small', 'medium', 'large', 'left', 'right', 'center', 'top', 'bottom',
          'middle', 'baseline', 'start', 'end', 'nowrap', 'break', 'truncate',
          'ellipsis', 'clip', 'pointer',
          '0', '1', '-1', 'true', 'false', 'yes', 'no', 'on', 'off',
          'default', 'primary', 'secondary', 'ghost', 'outline', 'solid',
          'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'currentColor',
          'submit', 'reset', 'button', 'text', 'email', 'password', 'tel',
          'url', 'number', 'search', 'checkbox', 'radio', 'file', 'date',
          'time', 'hidden', 'range', 'color',
        ],
        'ignore-regex': [
          '^\\d+(\\.\\d+)?$',
          '^[a-z]+(-[a-z]+)*$',
          '^(bh_|__)[a-z_]+',
        ],
        'ignore-comment': true,
        'ignore-jsx-element': [
          'code', 'pre', 'span', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'label', 'strong', 'em', 'small', 'b', 'i', 'u',
        ],
        'ignore-property': [
          'meta.env', 'process.env',
        ],
        'ignore-text-template': true,
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
      'dist/**',
      'node_modules/**',
      'eslint.config.js',
      'public/page-health-hook.js'
    ]
  }
);
