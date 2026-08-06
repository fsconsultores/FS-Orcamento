'use server'

import { createClient } from '@/lib/supabase/server'
import { upsertInsumoDeComposicao, type CotacaoInsumoInput } from '@/lib/orcamento/insumos'
import { recalcularAutoAction } from './planilha/calcular-action'
import { registrarHistorico } from '@/lib/log'

/**
 * Atualiza preço/cotação de um insumo DENTRO de uma composição específica —
 * ver upsertInsumoDeComposicao. Diferente de atualizarPrecoInsumoAction (que
 * edita o avulso e sincroniza `estimado` só quando não há como escapar
 * disso), esta ação nunca mexe no `estimado` de outras cópias do mesmo
 * código: é o mecanismo que permite "estimado só nesta composição".
 */
export async function atualizarInsumoComposicaoAction(
  orcamentoId: string,
  insumoId: string,
  codigo: string,
  novoCusto: number,
  cotacao?: CotacaoInsumoInput
): Promise<{ ok: true }> {
  if (!codigo) throw new Error('Código do insumo ausente.')
  if (!Number.isFinite(novoCusto) || novoCusto < 0) throw new Error('Custo inválido.')

  const supabase = await createClient()
  const sb = supabase as any
  const { data: atual } = await sb
    .from('orcamento_insumos')
    .select('custo, estimado, estimado_motivo')
    .eq('id', insumoId)
    .eq('orcamento_id', orcamentoId)
    .maybeSingle()

  await upsertInsumoDeComposicao(supabase, orcamentoId, insumoId, codigo, novoCusto, atual?.custo ?? novoCusto, cotacao)
  recalcularAutoAction(orcamentoId).catch(console.error)

  registrarHistorico(supabase, {
    orcamentoId,
    entidade: 'insumo',
    tipo: 'sucesso',
    acao: 'atualizar_insumo_composicao',
    mensagem: `Preço/cotação do insumo "${codigo}" alterado (só nesta composição) de ${atual?.custo ?? '—'} para ${novoCusto}`,
    valorAnterior: atual ? { custo: atual.custo, estimado: atual.estimado ?? false, estimado_motivo: atual.estimado_motivo ?? null } : undefined,
    valorNovo: { custo: novoCusto, estimado: cotacao?.estimado ?? false, estimado_motivo: cotacao?.estimado ? (cotacao.estimadoMotivo ?? null) : null },
  }).catch(console.error)

  return { ok: true }
}
