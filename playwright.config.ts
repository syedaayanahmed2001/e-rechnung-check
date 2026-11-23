import { defineConfig } from "@playwright/test";

/**
 * Browser tests against the production build on port 3300. Uses an installed Chromium-based
 * browser (Edge on Windows, Chrome elsewhere) so no browser download is needed:
 *   PW_CHANNEL=msedge npx playwright test
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3300",
    // "chromium" = the browser installed by `npx playwright install chromium` (CI).
    channel: process.env.PW_CHANNEL === "chromium" ? undefined : (process.env.PW_CHANNEL ?? "chrome"),
    headless: true,
  },
  webServer: {
    command: "npx next start -p 3300 -H 127.0.0.1",
    url: "http://127.0.0.1:3300",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
