import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config.mjs";

export default defineConfig(baseConfig, {
  testDir: "./performance",
  testMatch: "**/*.perf.spec.js",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/performance",
  use: {
    ...baseConfig.use,
    baseURL: "http://127.0.0.1:4174",
    trace: "off",
    video: "off",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
