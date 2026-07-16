import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getPlanilhasByOrcamento, getOrCreateDefaultPlanilha } from './planilhas'
import type { OrcamentoPlanilha } from './types'

/**
 * Lista as planilhas do orçamento, garantindo que ao menos uma exista
 * (retrocompatibilidade). Equivale a `getOrCreateDefaultPlanilha` seguido de
 * `getPlanilhasByOrcamento`, mas sem repetir a consulta de listagem no
 * caminho comum (planilhas já existem). Memoizado por requisição (React
 * cache) — layout e página (Planilha/Curva ABC/Relatórios/raiz do orçamento)
 * chamam isso na mesma navegação e reaproveitam o resultado em vez de
 * consultar repetidas vezes.
 *
 * Em arquivo separado de `planilhas.ts` (não server-only) porque este usa
 * `next/headers` via `createClient`, e `planilhas.ts` também é importado por
 * Client Components (ex: orcamentos/novo/page.tsx via createPlanilha).
 */
export const getPlanilhasEnsuredCached = cache(async (orcamentoId: string): Promise<OrcamentoPlanilha[]> => {
  const supabase = await createClient()
  let planilhas = await getPlanilhasByOrcamento(supabase, orcamentoId)
  if (planilhas.length === 0) {
    try {
      await getOrCreateDefaultPlanilha(supabase, orcamentoId)
      planilhas = await getPlanilhasByOrcamento(supabase, orcamentoId)
    } catch {}
  }
  return planilhas
})
