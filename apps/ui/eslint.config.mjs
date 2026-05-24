// ESLint 9 flat config for remote-falcon-ui.
//
// Replaces the legacy .eslintrc.json (which extended Create React App's
// `react-app` preset) with a hand-rolled composition of the underlying
// plugins.  The CRA preset (`eslint-config-react-app`) was never updated
// past its v8-peer-deps shape and so cannot run under ESLint 9.
//
// The rule set below tracks the warning-level surface that `react-app`
// previously enforced: the @eslint/js recommended set, the React-specific
// rules from eslint-plugin-react, the two stable Rules of Hooks lints,
// import-hygiene basics, and the well-known jsx-a11y warnings.
//
// `eslint-config-prettier` is applied last to switch off any stylistic
// rules that would conflict with a Prettier formatter (kept for parity
// with the previous toolchain — Prettier itself is not wired into lint).

import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';

export default [
  // 1. Ignore generated / vendored output.
  {
    ignores: ['dist/**', 'build/**', 'coverage/**', 'node_modules/**', 'public/**'],
  },

  // 2. Global linter options.
  {
    // The codebase still carries a handful of `// eslint-disable-next-line`
    // comments that reference rules from the old CRA preset which are
    // not enabled here (e.g. `consistent-return`, `import/prefer-default-export`).
    // Turn off the "unused disable directive" check so this migration
    // stays a tool-only change — the lingering comments can be swept up
    // in a follow-up.
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },

  // 3. Base recommended JS rules.
  js.configs.recommended,

  // 4. React + JSX globals / parser for all source files we lint.
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
      import: importPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // ---- React (subset of plugin:react/recommended, warn-only) ----
      'react/jsx-no-comment-textnodes': 'warn',
      'react/jsx-no-duplicate-props': 'warn',
      'react/jsx-no-target-blank': 'warn',
      'react/jsx-no-undef': 'error',
      // The codebase still uses `import React from 'react'`; keep the
      // "uses-react" rule on so JSX counts as a use and React isn't
      // flagged as an unused import.
      'react/jsx-uses-react': 'warn',
      'react/jsx-uses-vars': 'warn',
      'react/no-children-prop': 'warn',
      'react/no-danger-with-children': 'warn',
      'react/no-direct-mutation-state': 'warn',
      'react/no-is-mounted': 'warn',
      'react/no-typos': 'error',
      'react/no-unescaped-entities': 'warn',
      'react/require-render-return': 'error',
      'react/react-in-jsx-scope': 'off', // React 17+ JSX transform
      'react/style-prop-object': 'warn',

      // ---- React Hooks (classic, matches CRA preset) ----
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ---- Import hygiene (matches CRA preset subset) ----
      // `import/first` is intentionally OFF (CRA had it on as 'error').
      // The codebase places `vi.mock()` between imports in vitest specs;
      // vitest hoists those calls at transform time so the file works,
      // but `eslint --fix` would otherwise rewrite the layout on every
      // run.  Re-enable in a follow-up after the test files are
      // restructured (or replaced with `vi.hoisted`).
      'import/first': 'off',
      'import/no-amd': 'error',
      'import/no-anonymous-default-export': 'warn',
      'import/no-webpack-loader-syntax': 'error',

      // ---- jsx-a11y (matches CRA preset subset) ----
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-has-content': 'warn',
      'jsx-a11y/anchor-is-valid': ['warn', { aspects: ['noHref', 'invalidHref'] }],
      'jsx-a11y/aria-activedescendant-has-tabindex': 'warn',
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/aria-proptypes': 'warn',
      'jsx-a11y/aria-role': ['warn', { ignoreNonDOM: true }],
      'jsx-a11y/aria-unsupported-elements': 'warn',
      'jsx-a11y/heading-has-content': 'warn',
      'jsx-a11y/iframe-has-title': 'warn',
      'jsx-a11y/img-redundant-alt': 'warn',
      'jsx-a11y/no-access-key': 'warn',
      'jsx-a11y/no-distracting-elements': 'warn',
      'jsx-a11y/no-redundant-roles': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',
      'jsx-a11y/scope': 'warn',

      // ---- Core JS overrides (warn-not-error, matches CRA tone) ----
      'no-loop-func': 'warn',
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
      'no-useless-escape': 'warn',
      'no-undef': 'error',
      // CRA's `react-app` preset never enabled these ES2022 rules from
      // `eslint:recommended`; downgrade or disable to preserve the
      // pre-existing lint surface (0 errors today).  Revisit in a
      // separate pass.
      'no-unsafe-optional-chaining': 'warn',
      'no-misleading-character-class': 'warn',
      'no-async-promise-executor': 'warn',
    },
  },

  // 5. Disable any stylistic rules that would conflict with Prettier.
  prettierConfig,
];
