'use server'

import { createClient } from '@/lib/supabase/server'
import { upsertAvulsoInsumo } from '@/lib/orcamento/insumos'
import { recalcularAutoAction } from './planilha/calcular-action'
import { registrarHistorico } from '@/lib/log'

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
  const sb = supabase as any
  const { data: atual } = await sb
    .from('orcamento_insumos')
    .select('custo')
    .eq('orcamento_id', orcamentoId)
    .eq('codigo', codigo)
    .is('composicao_id', null)
    .maybeSingle()

  await upsertAvulsoInsumo(sb, orcamentoId, codigo, novoCusto, extra)
  recalcularAutoAction(orcamentoId).catch(console.error)

  registrarHistorico(supabase, {
    orcamentoId,
    entidade: 'insumo',
    tipo: 'sucesso',
    acao: 'atualizar_preco_insumo',
    mensagem: `Preço do insumo "${codigo}" alterado de ${atual?.custo ?? '—'} para ${novoCusto}`,
    valorAnterior: atual ? { custo: atual.custo } : undefined,
    valorNovo: { custo: novoCusto },
  }).catch(console.error)

  return { ok: true }
}
