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

    // Abre o modal global de novo insumo ("+ Insumo F2" no cabeçalho —
    // substituiu o antigo formulário inline, cujo componente foi removido
    // por estar morto; ver GlobalCreateActions em global-create-actions.tsx).
    await page.click('button[title="Novo Insumo (F2)"]');

    // Modal não tem role="dialog"; escopar pelo overlay desambigua de
    // qualquer botão/texto igual que já esteja na página por trás.
    const overlay = page.locator('.fixed.inset-0.z-50');
    await expect(overlay).toBeVisible();

    // Inputs de texto (não-numéricos) na ordem: Código, Descrição, Unidade, Base
    const textInputs = overlay.locator('input:not([type="number"])');
    await textInputs.nth(0).fill(INSUMO_CODE);
    await textInputs.nth(1).fill(INSUMO_DESCRICAO);
    await textInputs.nth(2).fill('SC');

    // Custo inicial
    await overlay.locator('input[type="number"]').first().fill(INSUMO_CUSTO_INICIAL);

    await overlay.getByRole('button', { name: 'Salvar Insumo' }).click();
    await expect(overlay).not.toBeVisible({ timeout: 10_000 });

    // Modal fechado = createInsumo já resolveu no cliente. router.refresh()
    // (startTransition, baixa prioridade) pode não ter repintado a tabela
    // ainda — reload força um fetch novo em vez de confiar no timing do
    // refresh assíncrono (mesmo padrão de versionamento-flow.spec.ts).
    await page.reload();

    // Insumo aparece na tabela após o reload
    await expect(page.locator('tbody').getByText(INSUMO_CODE)).toBeVisible({
      timeout: 15_000,
    });
  });

  // ─── 4. Editar preço do insumo ────────────────────────────────────────────

  test('4 - Editar preço do insumo', async ({ page }) => {
    expect(orcamentoId, 'Necessário ter criado o orçamento primeiro').toBeTruthy();

    await page.goto(`/orcamentos/${orcamentoId}/insumos`);

    // Localiza a linha do insumo criado
    const row = page.locator('tbody tr').filter({ hasText: INSUMO_CODE });
    await expect(row).toBeVisible({ timeout: 5_000 });

    // 4ª coluna = Custo (índice 3). O clique não edita mais inline — abre o
    // CotacaoInsumoModal (preço + fornecedor + data + observações), parte da
    // feature de Gestão de Cotações construída depois deste teste ter sido
    // escrito originalmente (mesma classe de teste desatualizado já corrigida
    // no passo 3 — "Novo Insumo").
    const custoCell = row.locator('td').nth(3);
    await custoCell.locator('span[title="Clique para editar preço e cotação"]').click();

    const overlay = page.locator('.fixed.inset-0.z-50');
    await expect(overlay).toBeVisible();
    // O <label> "Preço" não tem htmlFor/id associando ao input (getByLabel
    // não funciona aqui) — é sempre o 1º campo numérico do modal.
    await overlay.locator('input[type="number"]').first().fill(INSUMO_CUSTO_EDITADO);
    await overlay.getByRole('button', { name: 'Salvar' }).click();
    await expect(overlay).not.toBeVisible({ timeout: 10_000 });

    // Valor atualizado visível na célula
    await expect(custoCell).toContainText('150', { timeout: 10_000 });
  });

  // ─── 5. Criar composição ──────────────────────────────────────────────────

  test('5 - Criar composição', async ({ page }) => {
    expect(orcamentoId, 'Necessário ter criado o orçamento primeiro').toBeTruthy();

    await page.goto(`/orcamentos/${orcamentoId}/composicoes`);
    await expect(
      page.getByRole('heading', { name: 'Composições do Orçamento' }),
    ).toBeVisible();

    // Abre o modal global de nova composição ("+ Composição F4" no
    // cabeçalho — mesma migração de UI do passo 3: o formulário inline
    // antigo (nova-composicao-form.tsx) está morto, substituído por
    // GlobalCreateActions).
    await page.click('button[title="Nova Composição (F4)"]');

    const overlay = page.locator('.fixed.inset-0.z-50');
    await expect(overlay).toBeVisible();

    // Inputs na ordem do modal novo: Código, Unidade, Descrição, Base
    // (ordem diferente do formulário antigo — conferir sempre contra o JSX
    // atual de global-create-actions.tsx antes de reordenar).
    const inputs = overlay.locator('input');
    await inputs.nth(0).fill(COMP_CODE);
    await inputs.nth(1).fill(COMP_UNIDADE);
    await inputs.nth(2).fill(COMP_DESCRICAO);

    await overlay.getByRole('button', { name: /Salvar e adicionar insumos/ }).click();

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

    // "Exportar XLSX" só ABRE um modal de escolha de formato (Sintética/
    // Analítica, ver ExportComposicoesButton) — o download real só dispara
    // ao clicar em "Exportar" dentro dele. Formato "Analítica" já vem
    // selecionado por padrão, não precisa escolher.
    await page.getByRole('button', { name: 'Exportar XLSX' }).click();
    const overlay = page.locator('.fixed.inset-0.z-50');
    await expect(overlay).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      overlay.getByRole('button', { name: 'Exportar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/composicoes.*\.xlsx$/i);
  });
});
