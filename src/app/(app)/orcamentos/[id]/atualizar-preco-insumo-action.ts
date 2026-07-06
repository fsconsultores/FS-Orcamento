'use server'

import { createClient } from '@/lib/supabase/server'
import { upsertAvulsoInsumo } from '@/lib/orcamento/insumos'
import { recalcularAutoAction } from './planilha/calcular-action'

/**
 * Atualiza o preço canônico (avulso) de um insumo pelo código, a partir de
 * qualquer tela do orçamento (Curva ABC, Planilha analítica). Dispara
 * recálculo do projeto em segundo plano, mesmo padrão de insumos-table.tsx.
 */
export async function atualizarPrecoInsumoAction(
  orcamentoId: string,
  codigo: string,
  novoCusto: number,
  extra?: { descricao?: string; unidade?: string; grupo?: string | null }
): Promise<{ ok: true }> {
  if (!codigo) throw new Error('Código do insumo ausente.')
  if (!Number.isFinite(novoCusto) || novoCusto < 0) throw new Error('Custo inválido.')

  const supabase = await createClient()
  await upsertAvulsoInsumo(supabase as any, orcamentoId, codigo, novoCusto, extra)
  recalcularAutoAction(orcamentoId).catch(console.error)

  return { ok: true }
}
