import { defineConfig, devices } from "@playwright/test";
import { AUTH_STATE, E2E_PASSWORD } from "./tests/e2e/credentials";

export default defineConfig({
  testDir: "tests/e2e",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", locale: "fr-FR", timezoneId: "Europe/Paris", trace: "retain-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"], storageState: AUTH_STATE }, dependencies: ["setup"] },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, storageState: AUTH_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "sh scripts/e2e-server.sh",
    url: "http://127.0.0.1:3100/login",
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: { E2E_PASSWORD },
  },
});
