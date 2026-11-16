import { defineConfig, devices } from '@playwright/test';

const PORT = 4180;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${String(PORT)}/`, ...devices['Desktop Chrome'], acceptDownloads: true },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}/`,
    reuseExistingServer: !process.env.CI,
  },
});
