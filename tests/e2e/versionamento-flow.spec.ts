import { test, expect, type Page } from '@playwright/test';

// Cobre os fluxos de maior risco de dado do sistema (auditoria Fase 4, §7):
// criar versão, alterar depois de versionar, restaurar versão, criar
// orçamento a partir de uma versão, duplicar orçamento — nenhum tinha teste
// antes desta suíte. Sufixo único por execução evita conflito entre runs.
const RUN_ID = Date.now();
const ORCAMENTO_NOME = `Obra Versionamento PW ${RUN_ID}`;
const INSUMO_1_CODE = `PWV1-${RUN_ID}`;
const INSUMO_2_CODE = `PWV2-${RUN_ID}`;
const MENSAGEM_V1 = `Snapshot inicial PW ${RUN_ID}`;
const DUP_CODIGO = `ORC-PW-DUP-${RUN_ID}`;
const NOVO_ORC_DE_VERSAO_NOME = `Obra a partir de versão PW ${RUN_ID}`;

// Overlay de Modal/ConfirmDialog (src/components/ui/modal.tsx) não tem
// role="dialog" e reusa o mesmo texto de botão da página por trás (ex.:
// "Criar versão" aparece no cabeçalho E no rodapé do modal) — escopar pelo
// container do overlay é o que desambigua.
function modalOverlay(page: Page) {
  return page.locator('.fixed.inset-0.z-50');
}

// NOTA (achado da auditoria Fase 4, confirmado na prática ao rodar esta
// suíte pela 1ª vez): a UI migrou do formulário inline "Novo Insumo"
// (componente `novo-insumo-form.tsx`, HOJE MORTO — não é mais importado em
// lugar nenhum) para o botão global "+ Insumo F2" do cabeçalho do orçamento
// (`global-create-actions.tsx`, disponível em qualquer aba, abre modal). O
// seletor `button:has-text("Novo Insumo")` usado em orcamento-flow.spec.ts
// (test 3) reflete a UI antiga e está quebrado hoje — sintoma exato do gap
// "sem CI" da auditoria (§1/§2): ninguém percebeu porque nada roda os
// testes automaticamente. Não corrigido aqui de propósito — é o arquivo de
// outra suíte, fora do escopo desta tarefa (versionamento/duplicação);
// reportado ao usuário para decidir se conserta agora ou entra no backlog.
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

test.describe.serial('Versionamento e duplicação de orçamento', () => {
  let orcamentoId: string;
  let orcamentoDeVersaoId: string;

  // ─── 1. Criar orçamento + 1 insumo (estado a ser versionado) ─────────────

  test('1 - Criar orçamento e adicionar insumo inicial', async ({ page }) => {
    await page.goto('/orcamentos/novo');
    await expect(page.getByRole('heading', { name: 'Novo orçamento' })).toBeVisible();
    await page.fill('#nome_obra', ORCAMENTO_NOME);
    await page.fill('#codigo', `ORC-PWV-${RUN_ID}`);
    await page.fill('#bdi_global', '20');
    await page.click('button[type="submit"]:has-text("Criar orçamento")');
    await page.waitForURL(/\/orcamentos\/[0-9a-f-]{8,}/, { timeout: 25_000 });

    const urlParts = new URL(page.url()).pathname.split('/');
    orcamentoId = urlParts[urlParts.indexOf('orcamentos') + 1];
    expect(orcamentoId).toMatch(/^[0-9a-f-]+$/);

    await adicionarInsumo(page, orcamentoId, INSUMO_1_CODE, 'Insumo versão 1 Playwright');
  });

  // ─── 2. Criar versão ──────────────────────────────────────────────────────

  test('2 - Criar versão', async ({ page }) => {
    expect(orcamentoId, 'Precisa do orçamento criado no passo 1').toBeTruthy();
    await page.goto(`/orcamentos/${orcamentoId}/versoes`);
    await expect(page.getByRole('heading', { name: 'Versões' })).toBeVisible();

    // Com 0 versões, a tela mostra o botão do cabeçalho E o botão do
    // EmptyState, ambos com o mesmo texto "Criar versão" — usa o do
    // cabeçalho (.first(), sempre presente independente de haver versões).
    await page.getByRole('button', { name: 'Criar versão' }).first().click();
    const overlay = modalOverlay(page);
    await expect(overlay).toBeVisible();
    await overlay.locator('textarea').fill(MENSAGEM_V1);
    await overlay.getByRole('button', { name: 'Criar versão' }).click();

    // O item na timeline (persistente) é a prova definitiva de sucesso — o
    // toast (transitório, 4s) é best-effort, pode não ser pego se
    // criarVersao (captura o snapshot inteiro) demorar mais que o normal.
    await expect(page.getByText(MENSAGEM_V1)).toBeVisible({ timeout: 30_000 });
  });

  // ─── 3. Alterar orçamento depois de versionado ───────────────────────────

  test('3 - Alterar orçamento após criar versão', async ({ page }) => {
    expect(orcamentoId).toBeTruthy();
    await adicionarInsumo(page, orcamentoId, INSUMO_2_CODE, 'Insumo versão 2 Playwright');

    // Confirma que o estado alterado tem os 2 insumos ANTES de restaurar —
    // é a linha de base que o teste 4 precisa provar que volta a mudar.
    await page.goto(`/orcamentos/${orcamentoId}/insumos`);
    await expect(page.locator('tbody').getByText(INSUMO_1_CODE)).toBeVisible();
    await expect(page.locator('tbody').getByText(INSUMO_2_CODE)).toBeVisible();
  });

  // ─── 4. Restaurar versão ──────────────────────────────────────────────────

  test('4 - Restaurar versão', async ({ page }) => {
    expect(orcamentoId).toBeTruthy();
    await page.goto(`/orcamentos/${orcamentoId}/versoes`);

    const item = page.locator('div.relative.flex.gap-3').filter({ hasText: MENSAGEM_V1, hasNotText: 'Antes de restaurar' });
    await expect(item).toBeVisible({ timeout: 20_000 });
    await item.getByRole('button', { name: 'Restaurar' }).click();

    const overlay = modalOverlay(page);
    await expect(overlay).toBeVisible();
    await overlay.getByRole('button', { name: 'Restaurar versão' }).click();

    // Restaurar navega pra Planilha ao concluir.
    await page.waitForURL(new RegExp(`/orcamentos/${orcamentoId}/planilha`), { timeout: 20_000 });

    // O insumo adicionado DEPOIS da versão precisa ter sumido; o da versão continua.
    await page.goto(`/orcamentos/${orcamentoId}/insumos`);
    await expect(page.locator('tbody').getByText(INSUMO_1_CODE)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('tbody').getByText(INSUMO_2_CODE)).not.toBeVisible();

    // Restaurar cria uma versão de segurança automática ("backup automático")
    // antes de sobrescrever — é a rede de segurança que o código promete na UI.
    // Usa a mensagem gerada por restaurarVersao (`Antes de restaurar "..."`),
    // única na página — "backup automático" sozinho é ambíguo (aparece tanto
    // no filtro "Backup automático" quanto no badge do item).
    await page.goto(`/orcamentos/${orcamentoId}/versoes`);
    await expect(page.getByText(`Antes de restaurar "${MENSAGEM_V1}"`)).toBeVisible({ timeout: 20_000 });
  });

  // ─── 5. Criar orçamento a partir de uma versão ───────────────────────────

  test('5 - Criar orçamento a partir de uma versão', async ({ page }) => {
    expect(orcamentoId).toBeTruthy();
    await page.goto(`/orcamentos/${orcamentoId}/versoes`);

    const item = page.locator('div.relative.flex.gap-3').filter({ hasText: MENSAGEM_V1, hasNotText: 'Antes de restaurar' });
    await expect(item).toBeVisible({ timeout: 20_000 });
    await item.getByRole('button', { name: 'Criar orçamento' }).click();

    const overlay = modalOverlay(page);
    await expect(overlay).toBeVisible();
    // O <label> do componente compartilhado Input/Textarea (src/components/ui/input.tsx)
    // não tem htmlFor/id associando ao campo — getByLabel não funciona em
    // nenhum modal do sistema. Usa posição: Nome(0)/Código(1)/Cliente(2) nos
    // inputs, Descrição(0)/Mensagem inicial(1) nas textareas.
    await overlay.locator('input').nth(0).fill(NOVO_ORC_DE_VERSAO_NOME);
    await overlay.locator('textarea').nth(1).fill('Primeira versão do orçamento derivado (Playwright)');
    await overlay.getByRole('button', { name: 'Criar orçamento' }).click();

    await page.waitForURL(/\/orcamentos\/[0-9a-f-]{8,}\/planilha/, { timeout: 20_000 });
    const urlParts = new URL(page.url()).pathname.split('/');
    orcamentoDeVersaoId = urlParts[urlParts.indexOf('orcamentos') + 1];
    expect(orcamentoDeVersaoId).toMatch(/^[0-9a-f-]+$/);
    expect(orcamentoDeVersaoId).not.toBe(orcamentoId);

    // Independente e com o conteúdo da versão de origem (INSUMO_1, não o INSUMO_2).
    await page.goto(`/orcamentos/${orcamentoDeVersaoId}/insumos`);
    await expect(page.locator('tbody').getByText(INSUMO_1_CODE)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('tbody').getByText(INSUMO_2_CODE)).not.toBeVisible();

    // Ganha sua própria primeira versão (criarVersao interno do fluxo).
    await page.goto(`/orcamentos/${orcamentoDeVersaoId}/versoes`);
    await expect(page.getByText('Primeira versão do orçamento derivado')).toBeVisible({ timeout: 20_000 });

    // O orçamento de ORIGEM não foi alterado por esse fluxo.
    await page.goto(`/orcamentos/${orcamentoId}/insumos`);
    await expect(page.locator('tbody').getByText(INSUMO_1_CODE)).toBeVisible();
    await expect(page.locator('tbody').getByText(INSUMO_2_CODE)).not.toBeVisible();
  });

  // ─── 6. Duplicar orçamento ────────────────────────────────────────────────

  test('6 - Duplicar orçamento', async ({ page }) => {
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

  // ─── 7. Cenário de erro: duplicar com código já em uso ───────────────────

  test('7 - Erro ao duplicar com código já em uso', async ({ page }) => {
    expect(orcamentoId).toBeTruthy();
    await page.goto('/orcamentos');
    const row = page.locator('tr').filter({ hasText: ORCAMENTO_NOME }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Duplicar' }).click();

    const overlay = modalOverlay(page);
    await expect(overlay).toBeVisible();
    // Reusa o código já usado no teste 6 — deve ser rejeitado com erro
    // inline, sem criar um orçamento novo nem deixar a modal fechar sozinha.
    await overlay.locator('input').fill(DUP_CODIGO);
    await overlay.getByRole('button', { name: 'Duplicar', exact: true }).click();

    await expect(overlay.getByText(/já está em uso/i)).toBeVisible({ timeout: 20_000 });
    await expect(overlay).toBeVisible();
  });
});
