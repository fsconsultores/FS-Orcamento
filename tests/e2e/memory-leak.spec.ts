import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Navegação longa e repetida entre as abas de um orçamento, amostrando heap
// JS (com GC forçado antes de cada amostra, via CDP) e contadores de
// timers/listeners ativos (via monkeypatch injetado antes da navegação).
// Não é uma prova formal de ausência de leak, mas pega o padrão real que
// interessa: heap que só cresce (nunca volta a um patamar) ao longo de
// muitos ciclos, ou timers/listeners que nunca voltam a zero depois de sair
// de uma tela — sinal de cleanup faltando em useEffect.

const CICLOS = 15;
const ABAS = ['planilha', 'insumos', 'composicoes', 'relatorios', 'curva-abc'] as const;

const INIT_SCRIPT = `
(() => {
  const w = window;
  w.__memCounters = { timers: 0, listeners: 0 };
  const origSetTimeout = w.setTimeout;
  const origClearTimeout = w.clearTimeout;
  const origSetInterval = w.setInterval;
  const origClearInterval = w.clearInterval;
  w.setTimeout = function (...args) { w.__memCounters.timers++; return origSetTimeout.apply(w, args); };
  w.clearTimeout = function (...args) { w.__memCounters.timers--; return origClearTimeout.apply(w, args); };
  w.setInterval = function (...args) { w.__memCounters.timers++; return origSetInterval.apply(w, args); };
  w.clearInterval = function (...args) { w.__memCounters.timers--; return origClearInterval.apply(w, args); };
  const origAdd = EventTarget.prototype.addEventListener;
  const origRemove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (...args) { w.__memCounters.listeners++; return origAdd.apply(this, args); };
  EventTarget.prototype.removeEventListener = function (...args) { w.__memCounters.listeners--; return origRemove.apply(this, args); };
})();
`;

test('Crescimento de memória em navegação longa (15 ciclos × 5 abas)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'performance.memory e HeapProfiler são específicos do Chromium');
  test.setTimeout(5 * 60_000); // 15 ciclos × 5 navegações com networkidle — passa longe dos 30s padrão

  await page.goto('/orcamentos');
  await expect(page.locator('a[href^="/orcamentos/"]').first()).toBeVisible({ timeout: 15_000 });
  const href = await page.locator('a[href^="/orcamentos/"]').first().getAttribute('href');
  const orcamentoId = href?.split('/')[2];
  expect(orcamentoId, 'precisa de pelo menos um orçamento existente para navegar').toBeTruthy();

  await page.addInitScript(INIT_SCRIPT);
  await page.goto(`/orcamentos/${orcamentoId}/planilha`);

  const cdp = await page.context().newCDPSession(page);

  async function amostrar() {
    // GC forçado 2x (1x costuma deixar sobras de finalizers) antes de medir.
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? null);
    const counters = await page.evaluate(() => (window as any).__memCounters ?? { timers: 0, listeners: 0 });
    return { heapMB: heap != null ? heap / (1024 * 1024) : null, ...counters };
  }

  const amostras: Array<{ ciclo: number; heapMB: number | null; timers: number; listeners: number }> = [];
  amostras.push({ ciclo: 0, ...(await amostrar()) });

  for (let ciclo = 1; ciclo <= CICLOS; ciclo++) {
    for (const aba of ABAS) {
      await page.goto(`/orcamentos/${orcamentoId}/${aba}`);
      await page.waitForLoadState('networkidle');
    }
    amostras.push({ ciclo, ...(await amostrar()) });
  }

  const outPath = path.join(__dirname, 'memory-leak-results.json');
  fs.writeFileSync(outPath, JSON.stringify(amostras, null, 2));

  console.log('\n[memory] Amostras (heap MB / timers ativos / listeners ativos):');
  for (const a of amostras) console.log(`  ciclo ${a.ciclo}: ${a.heapMB?.toFixed(1) ?? 'N/A'}MB · timers=${a.timers} · listeners=${a.listeners}`);

  const primeiro = amostras[0];
  const ultimo = amostras[amostras.length - 1];
  const meio = amostras[Math.floor(amostras.length / 2)];

  // Sinal de leak real: heap no fim MUITO maior que no meio E no início — não
  // é só ruído de GC (sawtooth normal), é crescimento monotônico persistente.
  if (primeiro.heapMB != null && meio.heapMB != null && ultimo.heapMB != null) {
    const cresceuDoMeioAoFim = ultimo.heapMB > meio.heapMB * 1.2;
    const cresceuDoInicioAoFim = ultimo.heapMB > primeiro.heapMB * 1.5;
    console.log(`\n[memory] heap: início=${primeiro.heapMB.toFixed(1)}MB meio=${meio.heapMB.toFixed(1)}MB fim=${ultimo.heapMB.toFixed(1)}MB`);
    if (cresceuDoMeioAoFim && cresceuDoInicioAoFim) {
      console.warn('[memory] ⚠️ heap cresceu consistentemente ao longo da navegação — possível leak real (não só GC não rodado)');
    } else {
      console.log('[memory] ✅ sem crescimento monotônico de heap acima do threshold');
    }
  }

  // Timers/listeners ativos não devem crescer sem limite ciclo a ciclo —
  // alguns globais (router, etc.) são esperados, mas a INCLINAÇÃO da reta
  // entre ciclos é o que importa: se cada ciclo de 5 abas deixa +N timers
  // presos, isso escala linearmente com o tempo de uso do app.
  const timersInicio = amostras[1]?.timers ?? 0;
  const timersFim = ultimo.timers;
  const listenersInicio = amostras[1]?.listeners ?? 0;
  const listenersFim = ultimo.listeners;
  console.log(`[memory] timers ativos: ciclo 1=${timersInicio} → ciclo ${CICLOS}=${timersFim} (delta ${timersFim - timersInicio} em ${CICLOS - 1} ciclos)`);
  console.log(`[memory] listeners ativos: ciclo 1=${listenersInicio} → ciclo ${CICLOS}=${listenersFim} (delta ${listenersFim - listenersInicio} em ${CICLOS - 1} ciclos)`);
  if (timersFim - timersInicio > CICLOS) {
    console.warn(`[memory] ⚠️ timers ativos crescendo ~${((timersFim - timersInicio) / (CICLOS - 1)).toFixed(1)}/ciclo — possível setTimeout/setInterval sem cleanup`);
  }
  if (listenersFim - listenersInicio > CICLOS * 3) {
    console.warn(`[memory] ⚠️ listeners ativos crescendo ~${((listenersFim - listenersInicio) / (CICLOS - 1)).toFixed(1)}/ciclo — possível addEventListener sem cleanup`);
  }
});
