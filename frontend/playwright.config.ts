import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const localPython = resolve(
  '..',
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
)
const python = process.env.SAMAL_PYTHON || (existsSync(localPython) ? localPython : 'python')

export default defineConfig({
  testDir: './e2e',
  timeout: 360_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8095',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [false, true].map((demo) => ({
    command: `"${python}" ../scripts/e2e_server.py --port ${demo ? 8096 : 8095} ${demo ? '--demo' : ''}`,
    url: `http://127.0.0.1:${demo ? 8096 : 8095}/api/health`,
    reuseExistingServer: false,
    timeout: 90_000,
  })),
})
