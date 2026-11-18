import { defineConfig, devices } from "@playwright/test";

const port = 3100;

/**
 * Browser tests for the task's scenarios. `npm run e2e` builds the app, starts
 * it on a fresh port and drives it in Chromium. Run `npx playwright install
 * chromium` once first, or point PLAYWRIGHT_CHROMIUM_PATH at a Chromium you
 * already have.
 */
export default defineConfig({
  testDir: "./e2e",
  // The scenarios change data (they deactivate accounts) and share one server,
  // so they run one after another, in the order of the task.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${port}`,
    url: `http://localhost:${port}/login`,
    // Never reuse a server that is already running: the data in it may have
    // been changed by an earlier run, and the scenarios start from the seed.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
