import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3001'
const ORC_ID = '61ffa8f0-4dfa-423c-a8d8-3590b3710aac' // Forno de Minas
const CODIGO = 'ZZ' + Date.now().toString().slice(-6)

const browser = await chromium.launch()
const context = await browser.newContext({ storageState: 'tests/e2e/.auth/user.json' })
const page = await context.newPage()
page.on('console', msg => console.log('[console]', msg.type(), msg.text()))
page.on('pageerror', err => console.log('[pageerror]', err.message))

try {
  // 1. Criar nova composição
  await page.goto(`${BASE}/orcamentos/${ORC_ID}/composicoes`)
  await page.click('button:has-text("Nova Composição")')
  const form = page.locator('form:has-text("Nova Composição")')
  await form.locator('input').nth(0).fill(CODIGO) // codigo
  await form.locator('input').nth(1).fill('Composicao Teste Bug Analitica') // descricao
  await form.locator('input').nth(2).fill('UN') // unidade
  console.log('Criando composicao com codigo', CODIGO)
  await page.click('button:has-text("Criar e adicionar insumos")')
  await page.waitForURL(/\/composicoes\/[a-f0-9-]+\?addItem=1/, { timeout: 15000 })
  console.log('Composicao criada, URL:', page.url())

  // 2. Adicionar um insumo à composição (form de adição já aberto via addItem=1)
  await page.waitForSelector('input[placeholder="Código ou descrição do insumo..."]', { timeout: 10000 })
  await page.click('input[placeholder="Código ou descrição do insumo..."]')
  await page.waitForSelector('ul li', { timeout: 10000 })
  const firstSugestao = page.locator('ul li').first()
  const sugestaoText = await firstSugestao.innerText()
  console.log('Selecionando insumo:', sugestaoText)
  await firstSugestao.click()
  await page.click('button:has-text("Adicionar"):not(:has-text("item"))')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'tmp-screenshot-1-composicao.png', fullPage: true })
  console.log('Insumo adicionado a composicao')

  // 3. Ir para a planilha
  await page.goto(`${BASE}/orcamentos/${ORC_ID}/planilha`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  // Encontrar a primeira linha de grupo (nivel 1, com filhos) e adicionar sub-item
  const rows = page.locator('table tbody tr')
  const rowCount = await rows.count()
  console.log('Total de linhas na planilha:', rowCount)
  // Procura a primeira linha com classe que indica grupo (font-bold + bg escuro) - usa a primeira linha
  const firstRow = rows.first()
  await firstRow.hover()
  await page.waitForTimeout(300)
  // O primeiro botão de ação (svg com path "M12 4v16m8-8H4") é "Adicionar sub-item"
  const addSubBtn = firstRow.locator('button[title="Adicionar sub-item"]')
  await addSubBtn.click({ force: true })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'tmp-screenshot-2-add-item-form.png', fullPage: true })

  // 4. Preencher o formulário de novo item com o código da nova composição
  const codigoInput = page.locator('form .relative input').first()
  await codigoInput.click()
  await codigoInput.fill(CODIGO)
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'tmp-screenshot-3-autocomplete.png', fullPage: true })
  const sugestaoLi = page.locator('ul li', { hasText: CODIGO }).first()
  const sugestaoVisible = await sugestaoLi.isVisible().catch(() => false)
  console.log('Sugestao de codigo visivel?', sugestaoVisible)
  if (sugestaoVisible) {
    await sugestaoLi.click()
  }
  await page.waitForTimeout(300)

  // Preencher descricao se necessário e quantidade
  const descInput = page.locator('form input').filter({ hasText: '' }).nth(1)
  const qtdInput = page.locator('form input[type="number"]').first()
  await qtdInput.fill('1')

  await page.screenshot({ path: 'tmp-screenshot-4-before-save.png', fullPage: true })
  await page.click('form button:has-text("Salvar")')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'tmp-screenshot-5-after-save.png', fullPage: true })
  console.log('Item adicionado a planilha com codigo', CODIGO)

  // 5. Alternar para visualização Analítica
  await page.click('button:has-text("Analítica")')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'tmp-screenshot-6-analitica.png', fullPage: true })

  // 6. Verificar se o item com nosso codigo tem insumos abaixo
  const bodyText = await page.locator('table').innerText()
  const hasCodigo = bodyText.includes(CODIGO)
  console.log('Tabela contém o codigo novo?', hasCodigo)

  console.log('CODIGO USADO:', CODIGO)
} catch (err) {
  console.error('ERRO:', err)
  await page.screenshot({ path: 'tmp-screenshot-error.png', fullPage: true })
} finally {
  await browser.close()
}
