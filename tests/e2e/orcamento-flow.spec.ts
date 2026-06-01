import { test, expect } from '@playwright/test';
import path from 'path';

// Sufixo único por execução para evitar conflitos em múltiplos runs
const RUN_ID = Date.now();
const ORCAMENTO_NOME = `Obra Playwright ${RUN_ID}`;
const INSUMO_CODE = `PW${RUN_ID}`;
const INSUMO_DESCRICAO = 'Cimento Portland CP-II Playwright';
const INSUMO_CUSTO_INICIAL = '100';
const INSUMO_CUSTO_EDITADO = '150';
const COMP_CODE = `CPW${RUN_ID}`;
const COMP_DESCRICAO = 'Alvenaria de Tijolo Playwright';
const COMP_UNIDADE = 'm²';

test.describe.serial('Fluxo completo de orçamento', () => {
  let orcamentoId: string;
  let composicaoId: string;

  // ─── 1. Criar orçamento ────────────────────────────────────────────────────

  test('1 - Criar orçamento', async ({ page }) => {
    await page.goto('/orcamentos/novo');
    await expect(page.getByRole('heading', { name: 'Novo orçamento' })).toBeVisible();

    await page.fill('#nome_obra', ORCAMENTO_NOME);
    await page.fill('#codigo', `ORC-PW-${RUN_ID}`);
    await page.fill('#cliente', 'Cliente Playwright Test');
    await page.fill('#bdi_global', '20');

    await page.click('button[type="submit"]:has-text("Criar orçamento")');

    // Aguarda redirecionamento para o orçamento criado (UUID, não "novo")
    await page.waitForURL(/\/orcamentos\/[0-9a-f-]{8,}/, { timeout: 15_000 });

    const urlParts = new URL(page.url()).pathname.split('/');
    const orcIdx = urlParts.indexOf('orcamentos');
    orcamentoId = urlParts[orcIdx + 1];

    expect(orcamentoId, 'ID do orçamento deve ser capturado da URL').toMatch(
      /^[0-9a-f-]+$/,
    );
  });

  // ─── 2. Importar planilha de insumos ──────────────────────────────────────

  test('2 - Importar planilha de insumos', async ({ page }) => {
    await page.goto('/insumos/importar');
    await expect(
      page.getByRole('heading', { name: 'Importar insumos via CSV' }),
    ).toBeVisible();

    const csvPath = path.join(__dirname, 'fixtures', 'insumos-test.csv');
    await page.locator('input[type="file"]').setInputFiles(csvPath);

    // Aguarda exibição do preview
    await expect(page.getByText(/linha.*detectada/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(/válida/i)).toBeVisible();

    // Confirma importação
    await page.click('button:has-text("Importar")');

    // Mensagem de sucesso
    await expect(page.getByText(/Importação concluída/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  // ─── 3. Adicionar insumo ao orçamento ─────────────────────────────────────

  test('3 - Adicionar insumo ao orçamento', async ({ page }) => {
    expect(orcamentoId, 'Necessário ter criado o orçamento primeiro').toBeTruthy();

    await page.goto(`/orcamentos/${orcamentoId}/insumos`);

    // Abre formulário de novo insumo
    await page.click('button:has-text("Novo Insumo")');

    // Aguarda o formulário aparecer
    const form = page.locator('form').filter({ hasText: 'Novo Insumo' });
    await expect(form).toBeVisible();

    // Inputs de texto (não-numéricos) na ordem: Código, Descrição, Unidade, Base
    const textInputs = form.locator('input:not([type="number"])');
    await textInputs.nth(0).fill(INSUMO_CODE);
    await textInputs.nth(1).fill(INSUMO_DESCRICAO);
    await textInputs.nth(2).fill('SC');

    // Custo inicial
    await form.locator('input[type="number"]').first().fill(INSUMO_CUSTO_INICIAL);

    await form.getByRole('button', { name: 'Salvar Insumo' }).click();

    // Insumo aparece na tabela após refresh
    await expect(page.locator('tbody').getByText(INSUMO_CODE)).toBeVisible({
      timeout: 10_000,
    });
  });

  // ─── 4. Editar preço do insumo ────────────────────────────────────────────

  test('4 - Editar preço do insumo', async ({ page }) => {
    expect(orcamentoId, 'Necessário ter criado o orçamento primeiro').toBeTruthy();

    await page.goto(`/orcamentos/${orcamentoId}/insumos`);

    // Localiza a linha do insumo criado
    const row = page.locator('tbody tr').filter({ hasText: INSUMO_CODE });
    await expect(row).toBeVisible({ timeout: 5_000 });

    // 4ª coluna = Custo (índice 3). Clica no span de edição inline
    const custoCell = row.locator('td').nth(3);
    await custoCell.locator('span[title="Clique para editar"]').click();

    // Input de edição aparece
    const editInput = custoCell.locator('input[type="number"]');
    await expect(editInput).toBeVisible();
    await editInput.fill(INSUMO_CUSTO_EDITADO);
    await editInput.press('Enter');

    // Valor atualizado visível na célula
    await expect(custoCell).toContainText('150', { timeout: 5_000 });
  });

  // ─── 5. Criar composição ──────────────────────────────────────────────────

  test('5 - Criar composição', async ({ page }) => {
    expect(orcamentoId, 'Necessário ter criado o orçamento primeiro').toBeTruthy();

    await page.goto(`/orcamentos/${orcamentoId}/composicoes`);
    await expect(
      page.getByRole('heading', { name: 'Composições do Orçamento' }),
    ).toBeVisible();

    // Abre formulário de nova composição
    await page.getByRole('button', { name: 'Nova Composição' }).click();

    const form = page.locator('form').filter({ hasText: 'Nova Composição' });
    await expect(form).toBeVisible();

    // Inputs na ordem: Código, Descrição, Unidade, Base
    const inputs = form.locator('input');
    await inputs.nth(0).fill(COMP_CODE);
    await inputs.nth(1).fill(COMP_DESCRICAO);
    await inputs.nth(2).fill(COMP_UNIDADE);

    await form.getByRole('button', { name: /Criar e adicionar insumos/ }).click();

    // Redireciona para detalhe com ?addItem=1
    // Usa timeout maior pois next dev compila a página na primeira visita
    await page.waitForURL(/\/composicoes\/[^/?]+/, { timeout: 30_000 });

    const compMatch = page.url().match(/\/composicoes\/([^/?]+)/);
    expect(compMatch, 'ID da composição deve ser capturado da URL').toBeTruthy();
    composicaoId = compMatch![1];

    await expect(
      page.getByRole('heading', { name: COMP_DESCRICAO }),
    ).toBeVisible();
  });

  // ─── 6. Adicionar insumos à composição ───────────────────────────────────

  test('6 - Adicionar insumos à composição', async ({ page }) => {
    expect(orcamentoId, 'Necessário ter criado o orçamento').toBeTruthy();
    expect(composicaoId, 'Necessário ter criado a composição').toBeTruthy();

    // ?addItem=1 abre o formulário de adição automaticamente
    await page.goto(
      `/orcamentos/${orcamentoId}/composicoes/${composicaoId}?addItem=1`,
    );

    // Formulário de adição deve estar visível (autoOpenAdd=true)
    const searchInput = page.locator(
      'input[placeholder*="Código ou descrição do insumo"]',
    );
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    // Busca pelo insumo pelo código
    await searchInput.fill(INSUMO_CODE);

    // Aguarda dropdown do autocomplete
    const dropdown = page.locator('ul.fixed');
    await expect(dropdown.locator('li').first()).toBeVisible({ timeout: 5_000 });

    // Clica no primeiro resultado
    await dropdown.locator('li').first().click();

    // Preview do insumo selecionado (p.bg-blue-100 é o pill de confirmação)
    await expect(page.locator('p.bg-blue-100').filter({ hasText: INSUMO_DESCRICAO })).toBeVisible();

    // Define índice = 2
    const indexInput = page
      .locator('div').filter({ hasText: 'Índice' })
      .locator('input[type="number"]')
      .last();
    await indexInput.fill('2');

    // Confirma adição
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();

    // Item aparece na tabela de itens da composição
    await expect(page.locator('tbody').getByText(INSUMO_CODE)).toBeVisible({
      timeout: 5_000,
    });
  });

  // ─── 7. Calcular custo da composição ─────────────────────────────────────

  test('7 - Calcular custo da composição', async ({ page }) => {
    expect(orcamentoId, 'Necessário ter criado o orçamento').toBeTruthy();
    expect(composicaoId, 'Necessário ter criado a composição').toBeTruthy();

    await page.goto(`/orcamentos/${orcamentoId}/composicoes/${composicaoId}`);

    // Aguarda a tabela carregar com o item adicionado
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 10_000 });

    // Custo unitário: 150 (preço editado) × 2 (índice) = R$ 300,00
    // Verificação no rodapé da tabela
    const tfoot = page.locator('tfoot');
    await expect(tfoot).toBeVisible();
    await expect(tfoot.locator('td.font-bold')).toContainText('300');

    // Verificação no cabeçalho (custo unitário exibido no topo)
    await expect(page.locator('p.text-2xl.font-bold')).toContainText('300');
  });

  // ─── 8. Exportar Excel ────────────────────────────────────────────────────

  test('8 - Exportar Excel das composições', async ({ page }) => {
    expect(orcamentoId, 'Necessário ter criado o orçamento').toBeTruthy();

    await page.goto(`/orcamentos/${orcamentoId}/composicoes`);

    // Aguarda a composição aparecer na lista
    await expect(page.getByText(COMP_CODE)).toBeVisible({ timeout: 5_000 });

    // Aciona download e verifica o arquivo
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar XLSX' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/composicoes.*\.xlsx$/i);
  });
});
