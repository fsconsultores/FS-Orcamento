import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Benchmark reproduzível: mede as operações mais comuns do dia a dia
// (abrir orçamento, trocar de aba, editar células, importar planilha,
// calcular, abrir relatório) contra um orçamento DESCARTÁVEL criado só para
// isso — nunca roda contra dados reais do usuário. Os resultados vão para
// tests/e2e/benchmark-results.json (histórico) para comparar antes/depois
// de futuras alterações: `npm run benchmark`.

const RUN_ID = Date.now();
const results: Record<string, number> = {};
// Rótulos do subnav (orcamento-subnav.tsx) — clicar no link, não
// page.goto(): staleTimes (Router Cache) só entra em jogo em navegação
// client-side via next/link, page.goto() sempre força um novo request.
const ABAS = [
  { suffix: 'insumos', label: 'Insumos' },
  { suffix: 'composicoes', label: 'Composições' },
  { suffix: 'relatorios', label: 'Relatórios' },
  { suffix: 'curva-abc', label: 'Curva ABC' },
  { suffix: 'planilha', label: 'Planilha' },
] as const;

test.describe.serial('Benchmark de performance', () => {
  let orcamentoId: string;

  test('Setup — criar orçamento descartável para benchmark', async ({ page }) => {
    await page.goto('/orcamentos/novo');
    await expect(page.getByRole('heading', { name: 'Novo orçamento' })).toBeVisible();
    await page.fill('#nome_obra', `Benchmark ${RUN_ID}`);
    await page.fill('#codigo', `BENCH-${RUN_ID}`);
    await page.fill('#bdi_global', '20');
    await page.click('button[type="submit"]:has-text("Criar orçamento")');
    await page.waitForURL(/\/orcamentos\/[0-9a-f-]{8,}/, { timeout: 15_000 });
    const parts = new URL(page.url()).pathname.split('/');
    orcamentoId = parts[parts.indexOf('orcamentos') + 1];
    expect(orcamentoId).toMatch(/^[0-9a-f-]+$/);
  });

  test('1 — Importar planilha (110 itens)', async ({ page }) => {
    await page.goto(`/orcamentos/${orcamentoId}/planilha`);
    await page.click('button:has-text("Importar Planilha")');
    const csvPath = path.join(__dirname, 'fixtures', 'planilha-benchmark.csv');

    const start = Date.now();
    await page.locator('input[type="file"]').setInputFiles(csvPath);
    await expect(page.getByText(/itens detectados/)).toBeVisible({ timeout: 5_000 });
    await page.click('button:has-text("Confirmar Importação")');
    // O formulário fecha assim que a importação termina (setOpen(false)) —
    // o sinal confiável de conclusão é a contagem de itens no cabeçalho
    // atualizar, não a mensagem de sucesso (que fica escondida pelo form
    // fechado antes de renderizar).
    await expect(page.getByText(/110 item\(ns\)/)).toBeVisible({ timeout: 20_000 });
    results['importar_planilha_110_itens_ms'] = Date.now() - start;
  });

  test('2 — Abrir orçamento (Planilha, primeira vez)', async ({ page }) => {
    const start = Date.now();
    await page.goto(`/orcamentos/${orcamentoId}/planilha`);
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState('networkidle');
    results['abrir_planilha_ms'] = Date.now() - start;
  });

  test('3/4 — Trocar entre as 5 abas via clique no menu (1ª volta vs revisita, mesma sessão)', async ({ page }) => {
    // As duas voltas PRECISAM rodar na mesma `page` (Playwright cria uma
    // página nova a cada test() — se cada volta fosse um test() separado, a
    // "revisita" começaria numa página em branco sem Router Cache nenhum,
    // invalidando a comparação). Por isso os antigos testes 3 e 4 viraram um
    // só, com duas voltas sequenciais na mesma sessão.
    await page.goto(`/orcamentos/${orcamentoId}/planilha`);
    await page.waitForLoadState('networkidle');

    async function umaVolta() {
      let total = 0;
      for (const aba of ABAS) {
        const t0 = Date.now();
        // Existe um link com o mesmo nome na sidebar (atalho global) além do
        // subnav da página — escopar ao <main> pega só o subnav do orçamento.
        await page.getByRole('main').getByRole('link', { name: aba.label, exact: true }).click();
        await page.waitForURL(new RegExp(`/${aba.suffix}(\\?|$)`));
        await page.waitForLoadState('networkidle');
        total += Date.now() - t0;
      }
      return total;
    }

    const primeiraVolta = await umaVolta();
    results['trocar_5_abas_click_primeira_visita_ms'] = primeiraVolta;
    results['trocar_1_aba_click_primeira_visita_media_ms'] = primeiraVolta / ABAS.length;

    // Revisita imediata, mesma sessão — dentro da janela de 30s do
    // staleTimes.dynamic configurado em next.config.ts. Isso é o que deveria
    // ficar "quase instantâneo".
    const revisita = await umaVolta();
    results['trocar_5_abas_click_revisita_ms'] = revisita;
    results['trocar_1_aba_click_revisita_media_ms'] = revisita / ABAS.length;
  });

  test('5 — Editar células em sequência (até 100)', async ({ page }) => {
    test.setTimeout(120_000); // até 100 cliques+digitação+Enter passa longe dos 30s padrão
    await page.goto(`/orcamentos/${orcamentoId}/planilha`);
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });

    // Coluna "Qtde." (7ª coluna: drag-handle, #, Item, Composição,
    // Descrição, Unidade, Qtde.) — célula numérica editável em toda linha de
    // item. A 1ª linha é o grupo raiz (sem Qtde. — pulada abaixo). Só as
    // linhas dentro do viewport existem no DOM (virtualização) — o total
    // real de células editáveis fica limitado a isso, sem scroll.
    await expect(page.locator('tbody tr').nth(1).locator('td:nth-child(7) div.cursor-text')).toBeVisible({ timeout: 10_000 });
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    const start = Date.now();
    let editadas = 0;
    for (let i = 1; i < rowCount && editadas < 100; i++) {
      const cell = rows.nth(i).locator('td:nth-child(7) div.cursor-text');
      try {
        await cell.click({ timeout: 2_000 });
        const input = page.locator('input:focus');
        await input.fill(String(10 + i), { timeout: 2_000 });
        await input.press('Enter');
        editadas++;
      } catch {
        // Linha sem célula editável nessa coluna (ex: virtualização
        // reindexou durante o loop) — pula em vez de travar o benchmark.
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
    const elapsed = Date.now() - start;
    expect(editadas, 'precisa ter editado pelo menos algumas células').toBeGreaterThan(0);
    results['editar_celulas_total_ms'] = elapsed;
    results['editar_celulas_count'] = editadas;
    results['editar_1_celula_media_ms'] = elapsed / editadas;
  });

  test('6 — Calcular planilha', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(`/orcamentos/${orcamentoId}/planilha`);
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });

    await page.click('button:has-text("Ferramentas")');
    await expect(page.getByText('Calcular Planilha')).toBeVisible({ timeout: 5_000 });

    const start = Date.now();
    await page.click('button:has-text("Calcular Planilha")');
    // O botão "Ferramentas" mostra "Calculando planilha…" enquanto roda e
    // volta ao texto normal quando termina.
    await expect(page.getByText('Calculando planilha')).toBeVisible({ timeout: 5_000 }).catch(() => {});
    await expect(page.getByText('Calculando planilha')).not.toBeVisible({ timeout: 30_000 });
    results['calcular_planilha_ms'] = Date.now() - start;
  });

  test('7 — Abrir Relatórios (gerar relatório)', async ({ page }) => {
    const start = Date.now();
    await page.goto(`/orcamentos/${orcamentoId}/relatorios`);
    await page.waitForLoadState('networkidle');
    results['abrir_relatorios_ms'] = Date.now() - start;
  });

  test.afterAll(() => {
    const outPath = path.join(__dirname, 'benchmark-results.json');
    const prior = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : { history: [] };
    const entry = { timestamp: new Date().toISOString(), orcamentoId, results };
    prior.history = [...(prior.history ?? []), entry];
    prior.latest = entry;
    fs.writeFileSync(outPath, JSON.stringify(prior, null, 2));
    console.log('\n[benchmark] Resultados:');
    for (const [k, v] of Object.entries(results)) console.log(`  ${k}: ${v.toFixed(1)}`);
  });
});
