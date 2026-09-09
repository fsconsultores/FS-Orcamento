import { test, expect, type Page } from '@playwright/test';

// Cobre os fluxos de duplicação de orçamento (auditoria Fase 4, §7) — antes
// vivia em versionamento-flow.spec.ts junto com testes da feature de versão
// (snapshot manual/Restaurar), removida do sistema (Revisões a substituiu
// como fluxo principal). Sufixo único por execução evita conflito entre runs.
const RUN_ID = Date.now();
const ORCAMENTO_NOME = `Obra Duplicacao PW ${RUN_ID}`;
const INSUMO_1_CODE = `PWD1-${RUN_ID}`;
const DUP_CODIGO = `ORC-PW-DUP-${RUN_ID}`;

// Overlay de Modal/ConfirmDialog (src/components/ui/modal.tsx) não tem
// role="dialog" e reusa o mesmo texto de botão da página por trás — escopar
// pelo container do overlay é o que desambigua.
function modalOverlay(page: Page) {
  return page.locator('.fixed.inset-0.z-50');
}

async function adicionarInsumo(page: Page, orcamentoId: string, codigo: string, descricao: string) {
  await page.goto(`/orcamentos/${orcamentoId}/insumos`);
  await page.click('button[title="Novo Insumo (F2)"]');
  const overlay = modalOverlay(page);
  await expect(overlay).toBeVisible();
  const textInputs = overlay.locator('input:not([type="number"])');
  await textInputs.nth(0).fill(codigo);
  await textInputs.nth(1).fill(descricao);
  await textInputs.nth(2).fill('SC');
  await overlay.locator('input[type="number"]').first().fill('100');
  await overlay.getByRole('button', { name: 'Salvar Insumo' }).click();
  await expect(overlay).not.toBeVisible({ timeout: 20_000 });
  // Modal fechado = createInsumo já resolveu no cliente. router.refresh()
  // (startTransition, baixa prioridade) pode não ter repintado a tabela
  // ainda quando a asserção abaixo roda — reload força um fetch novo em vez
  // de confiar no timing do refresh assíncrono.
  await page.reload({ timeout: 30_000 });
  await expect(page.locator('tbody').getByText(codigo)).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('Duplicação de orçamento', () => {
  let orcamentoId: string;

  test('1 - Criar orçamento e adicionar insumo', async ({ page }) => {
    await page.goto('/orcamentos/novo');
    await expect(page.getByRole('heading', { name: 'Novo orçamento' })).toBeVisible();
    await page.fill('#nome_obra', ORCAMENTO_NOME);
    await page.fill('#codigo', `ORC-PWD-${RUN_ID}`);
    await page.fill('#bdi_global', '20');
    await page.click('button[type="submit"]:has-text("Criar orçamento")');
    await page.waitForURL(/\/orcamentos\/[0-9a-f-]{8,}/, { timeout: 25_000 });

    const urlParts = new URL(page.url()).pathname.split('/');
    orcamentoId = urlParts[urlParts.indexOf('orcamentos') + 1];
    expect(orcamentoId).toMatch(/^[0-9a-f-]+$/);

    await adicionarInsumo(page, orcamentoId, INSUMO_1_CODE, 'Insumo Playwright duplicação');
  });

  test('2 - Duplicar orçamento', async ({ page }) => {
    expect(orcamentoId).toBeTruthy();
    await page.goto('/orcamentos');
    await expect(page.getByRole('heading', { name: 'Orçamentos' })).toBeVisible();

    const row = page.locator('tr').filter({ hasText: ORCAMENTO_NOME }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Duplicar' }).click();

    const overlay = modalOverlay(page);
    await expect(overlay).toBeVisible();
    await overlay.locator('input').fill(DUP_CODIGO);
    await overlay.getByRole('button', { name: 'Duplicar', exact: true }).click();

    await expect(page.getByText('Orçamento duplicado.')).toBeVisible({ timeout: 25_000 });

    // A cópia aparece na listagem e carrega o mesmo insumo do original.
    const copiaRow = page.locator('tr').filter({ hasText: `Cópia de ${ORCAMENTO_NOME}` }).first();
    await expect(copiaRow).toBeVisible({ timeout: 20_000 });
    await copiaRow.click();
    await page.waitForURL(/\/orcamentos\/[0-9a-f-]{8,}/, { timeout: 25_000 });
    const copiaUrlParts = new URL(page.url()).pathname.split('/');
    const copiaId = copiaUrlParts[copiaUrlParts.indexOf('orcamentos') + 1];

    await page.goto(`/orcamentos/${copiaId}/insumos`);
    await expect(page.locator('tbody').getByText(INSUMO_1_CODE)).toBeVisible({ timeout: 20_000 });
  });

  test('3 - Erro ao duplicar com código já em uso', async ({ page }) => {
    expect(orcamentoId).toBeTruthy();
    await page.goto('/orcamentos');
    const row = page.locator('tr').filter({ hasText: ORCAMENTO_NOME }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Duplicar' }).click();

    const overlay = modalOverlay(page);
    await expect(overlay).toBeVisible();
    // Reusa o código já usado no teste 2 — deve ser rejeitado com erro
    // inline, sem criar um orçamento novo nem deixar a modal fechar sozinha.
    await overlay.locator('input').fill(DUP_CODIGO);
    await overlay.getByRole('button', { name: 'Duplicar', exact: true }).click();

    await expect(overlay.getByText(/já está em uso/i)).toBeVisible({ timeout: 20_000 });
    await expect(overlay).toBeVisible();
  });
});
