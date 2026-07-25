import eslintJs from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export default defineConfig(
  {
    ignores: [
      "android/**",
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
    },
    rules: {
      "no-undef": "off",
      "no-useless-assignment": "off",
      "no-unused-vars": "warn",
      "@eslint-react/no-array-index-key": "off",
      "@eslint-react/no-missing-key": "off",
      "@eslint-react/no-unnecessary-use-prefix": "off",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error",
    },
  },
);
