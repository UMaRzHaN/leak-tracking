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
        afterEach: "readonly",
        beforeEach: "readonly",
        Blob: "readonly",
        Buffer: "readonly",
        caches: "readonly",
        cancelAnimationFrame: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        CustomEvent: "readonly",
        describe: "readonly",
        document: "readonly",
        DOMException: "readonly",
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
);
