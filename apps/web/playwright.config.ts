import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end: the real web app against the real API and database.
 * Start the API (bun run dev:api) with the seeded dev database first.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: process.env.WEB_URL ?? "http://localhost:5173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 820 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
});
