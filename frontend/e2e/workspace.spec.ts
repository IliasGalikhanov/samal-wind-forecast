import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defaults } from '../src/i18n'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (preferences) => {
      // Only initialise once, so reload tests exercise persisted preferences.
      if (!localStorage.getItem('samal.preferences')) {
        localStorage.setItem('samal.preferences', JSON.stringify(preferences))
        localStorage.setItem('samal.onboarded', 'true')
      }
    },
    { ...defaults, language: 'en', theme: 'light', autoRun: false, toasts: false },
  )
})

async function capture(page: Page, name: string) {
  if (!process.env.SAMAL_RECORD_DIR) return
  await page.screenshot({
    path: resolve(process.env.SAMAL_RECORD_DIR, name + '.png'),
    animations: 'disabled',
  })
}

async function navigate(page: Page, label: string) {
  await page.locator('nav').getByRole('button', { name: label, exact: true }).click()
}

async function addTurbine(page: Page, name: string) {
  await navigate(page, 'Settings')
  await page.getByRole('button', { name: 'Add turbine', exact: true }).click()
  await page.getByLabel('Turbine name', { exact: true }).fill(name)
  await page.getByLabel('Latitude', { exact: true }).fill('51.2')
  await page.getByLabel('Longitude', { exact: true }).fill('71.4')
  if (name === 'Synthetic import station') await capture(page, '01-station')
  await page.getByRole('button', { name: 'Save turbine', exact: true }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
  await navigate(page, 'Import data')
  await page.locator('.upload-options select').selectOption({ label: name })
}

test('create turbine, preview CSV, import and reject a conflicting measurement atomically', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await addTurbine(page, 'Synthetic import station')
  const csv = readFileSync(resolve('../data/demo/turbine.csv'))
  await page
    .locator('#csv-file')
    .setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: csv })
  await page.getByRole('button', { name: 'Preview file', exact: true }).click()
  await expect(page.locator('.preview-stats')).toContainText('12')
  await capture(page, '02-preview')
  const importing = page.waitForResponse(
    (r) => r.url().endsWith('/api/imports') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  expect((await importing).status()).toBe(201)
  await expect(page.getByText('File processed', { exact: true })).toBeVisible()
  await capture(page, '03-imported')
  // Reimport must be idempotent.
  await page
    .locator('#csv-file')
    .setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: csv })
  await page.getByRole('button', { name: 'Preview file', exact: true }).click()
  await expect(page.locator('.preview-stats')).toContainText('12')
  const tid = Number(await page.locator('.upload-options select').inputValue())
  const conflict = Buffer.from('time,wind,power,temperature\n2026-01-01 00:00:00,9,0.99,3\n')
  await page
    .locator('#csv-file')
    .setInputFiles({ name: 'conflict.csv', mimeType: 'text/csv', buffer: conflict })
  await page.getByRole('button', { name: 'Preview file', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeDisabled()
  const overview = await (await request.get('/api/overview')).json()
  expect(overview.turbines.find((t: { id: number }) => t.id === tid).rows).toBe(12)
})

test('invalid CSV shows an error and stores no observations', async ({ page, request }) => {
  await page.goto('/')
  await addTurbine(page, 'Invalid CSV station')
  await page.locator('#csv-file').setInputFiles({
    name: 'invalid.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('time,wind,power,temperature\n2026-01-01 00:00:00,6,NaN,3\n'),
  })
  await page.getByRole('button', { name: 'Preview file', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('.preview-footer')).toHaveCount(0)
  const overview = await (await request.get('/api/overview')).json()
  expect(
    overview.turbines.find((t: { name: string }) => t.name === 'Invalid CSV station').rows,
  ).toBe(0)
})

test('language and theme persist across reload', async ({ page }) => {
  await page.goto('/')
  await page.locator('.language-select').selectOption('kk')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Станцияға шолу')
  await page.locator('.topbar-right button').first().click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('.language-select')).toHaveValue('kk')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.locator('.language-select').selectOption('ru')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Обзор станции')
})

test('demo prevents imports and restores on both UI and server', async ({ page }) => {
  await page.goto('http://127.0.0.1:8096/')
  await navigate(page, 'Import data')
  await expect(page.locator('#csv-file')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add turbine', exact: true })).toBeDisabled()
  await navigate(page, 'Settings')
  await expect(page.locator('input[type=file][accept=".zip"]')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Inspect archive', exact: true })).toBeDisabled()
  const response = await page.request.post('http://127.0.0.1:8096/api/turbines', {
    data: { name: 'Forbidden', latitude: 0, longitude: 0 },
  })
  expect(response.status()).toBe(403)
})

test('real synthetic forecast appears in UI, exports CSV and reuses the model', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:8096/')
  await navigate(page, 'Power forecast')
  const start = page.waitForResponse(
    (r) => r.url().endsWith('/api/runs') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Calculate forecast', exact: true }).click()
  const run = await (await start).json()
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`http://127.0.0.1:8096/api/runs/${run.id}`)).json()).status,
      { timeout: 300_000, intervals: [1000, 2000] },
    )
    .toBe('completed')
  await expect(page.getByRole('heading', { name: 'Hourly power', exact: true })).toBeVisible()
  const result = (await (await page.request.get(`http://127.0.0.1:8096/api/runs/${run.id}`)).json())
    .result
  expect(result.forecasts).toHaveLength(96)
  expect(result.data_source).toBe('synthetic')
  await capture(page, '04-forecast')
  const download = page.waitForEvent('download')
  await page.locator('.heading-actions a').click()
  const exported = await download
  expect(exported.suggestedFilename()).toMatch(/\.csv$/)
  const file = await exported.path()
  expect(readFileSync(file!, 'utf8')).toContain('synthetic')
  await navigate(page, 'Agent activity')
  await page.locator('.run-details summary').first().click()
  await expect(page.locator('.run-details ol').first()).not.toBeEmpty()
  await capture(page, '05-agent')
  await navigate(page, 'Model quality')
  await expect(page.locator('.recharts-wrapper').first()).toBeVisible()
  await capture(page, '06-quality')
  await navigate(page, 'Power forecast')
  const repeat = page.waitForResponse(
    (r) => r.url().endsWith('/api/runs') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Calculate forecast', exact: true }).click()
  const second = await (await repeat).json()
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`http://127.0.0.1:8096/api/runs/${second.id}`)).json())
          .status,
    )
    .toBe('completed')
  expect(
    (await (await page.request.get(`http://127.0.0.1:8096/api/runs/${second.id}`)).json()).result
      .training.reused,
  ).toBe(true)
})
