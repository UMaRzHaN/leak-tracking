import eslintJs from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export default defineConfig(
  {
    ignores: [
      ".codex-tmp/**",
      ".pnp.js",
      "android/**",
      "build/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,mjs}"],
    extends: [eslintJs.configs.recommended, eslintReact.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        AbortController: "readonly",
        atob: "readonly",
        btoa: "readonly",
        afterEach: "readonly",
        beforeEach: "readonly",
        Blob: "readonly",
        self: "readonly",
        Buffer: "readonly",
        caches: "readonly",
        cancelAnimationFrame: "readonly",
        createImageBitmap: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        CustomEvent: "readonly",
        describe: "readonly",
        document: "readonly",
        DOMException: "readonly",
        Event: "readonly",
        expect: "readonly",
        fetch: "readonly",
        File: "readonly",
        FileReader: "readonly",
        global: "readonly",
        HTMLElement: "readonly",
        HTMLAnchorElement: "readonly",
        Image: "readonly",
        indexedDB: "readonly",
        it: "readonly",
        localStorage: "readonly",
        location: "readonly",
        navigator: "readonly",
        OffscreenCanvas: "readonly",
        performance: "readonly",
        PopStateEvent: "readonly",
        process: "readonly",
        requestAnimationFrame: "readonly",
        require: "readonly",
        ResizeObserver: "readonly",
        Response: "readonly",
        setTimeout: "readonly",
        Storage: "readonly",
        TextEncoder: "readonly",
        URL: "readonly",
        vi: "readonly",
        window: "readonly",
        Worker: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-useless-assignment": "off",
      "no-unused-vars": "error",
      "@eslint-react/no-array-index-key": "off",
      "@eslint-react/no-missing-key": "off",
      "@eslint-react/no-unnecessary-use-prefix": "off",
      // Effects in this app intentionally reset local draft/loading state when
      // the active project, modal, or native storage source changes. The rule
      // treats those lifecycle resets as unconditional errors and encourages
      // riskier async deferrals, so it is not part of the project policy.
      "@eslint-react/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    // Only the app's own code. The screenshot and seeding scripts are build
    // tooling whose failures never reach a reader's diagnostics, and a test
    // may need an empty handler to drive a rejection on purpose.
    files: ["src/**/*.{js,jsx}"],
    ignores: ["src/**/*.test.{js,jsx}"],
    rules: {
      // An empty `.catch()` handler hides the failure completely — not even
      // the diagnostics a reader exports from the error screen keep it. Use
      // `ignoredError("area.action")` from `@/utils/ignoredError`: it swallows
      // the rejection the same way and leaves a warn behind. The three write
      // queues that legitimately need an empty handler disable this by name,
      // with the reason next to them.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression[body.type='BlockStatement'][body.body.length=0]",
          message:
            'Empty .catch() hides the failure — use ignoredError("area.action") from @/utils/ignoredError.',
        },
        {
          // `.at()` появился в Chrome 92, и шесть вызовов молча делали его
          // самым новым требованием всего приложения — новее любого синтаксиса,
          // который сборка умеет понижать. Отказ от него выглядел бы как
          // TypeError в середине работы, а не как ошибка сборки.
          selector: "CallExpression[callee.property.name='at']",
          message:
            "Array.prototype.at needs Chrome 92 and cannot be transpiled — use items[items.length - 1].",
        },
        {
          // Следующая ступень после `.at()`: Chrome 85. Ограничение бьёт по
          // вызову метода, а не по имени, — одноимённая функция нативного
          // хранилища (действие плагина) под него не попадает.
          selector: "CallExpression[callee.property.name='replaceAll']",
          message:
            "String.prototype.replaceAll needs Chrome 85 and cannot be transpiled — use .replace(/x/g, y) or .split(x).join(y).",
        },
        {
          // Ступень Chrome 73. Оба заменены своими модулями в @/utils; те
          // вызываются как функции, а не как методы, и под эти селекторы не
          // попадают.
          selector:
            "CallExpression[callee.object.name='Object'][callee.property.name='fromEntries']",
          message:
            "Object.fromEntries needs Chrome 73 and cannot be transpiled — use fromEntries from @/utils/fromEntries.",
        },
        {
          selector: "CallExpression[callee.property.name='matchAll']",
          message:
            "String.prototype.matchAll needs Chrome 73 and cannot be transpiled — use matchAll from @/utils/matchAll.",
        },
        {
          // Ступень Chrome 71. Это имя, а не метод: на старом WebView
          // обращение к нему — `ReferenceError`, а не тихое `undefined`.
          selector: "Identifier[name='globalThis']",
          message:
            "globalThis needs Chrome 71 — use globalScope from @/utils/globalScope.",
        },
      ],
    },
  },
);
