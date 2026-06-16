import { chromium } from '@playwright/test'
import path from 'path'

const BASE = 'http://localhost:3001'
const ORC_ID = '61ffa8f0-4dfa-423c-a8d8-3590b3710aac' // Forno de Minas
const CODIGO = process.argv[2] || 'ZZ849236'

const browser = await chromium.launch()
const context = await browser.newContext({ storageState: 'tests/e2e/.auth/user.json', acceptDownloads: true })
const page = await context.newPage()

try {
  await page.goto(`${BASE}/orcamentos/${ORC_ID}/caderno`)
  await page.waitForLoadState('networkidle')

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.click('button:has-text("Gerar Caderno PDF")'),
  ])

  const pdfPath = path.resolve('tmp-caderno.pdf')
  await download.saveAs(pdfPath)
  console.log('PDF salvo em', pdfPath)
} catch (err) {
  console.error('ERRO:', err)
  await page.screenshot({ path: 'tmp-screenshot-pdf-error.png', fullPage: true })
} finally {
  await browser.close()
}
