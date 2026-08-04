'use server'

import { createClient } from '@/lib/supabase/server'
import { upsertAvulsoInsumo, type CotacaoInsumoInput } from '@/lib/orcamento/insumos'
import { recalcularAutoAction } from './planilha/calcular-action'
import { registrarHistorico } from '@/lib/log'

/**
 * Atualiza o preço canônico (avulso) de um insumo pelo código, a partir de
 * qualquer tela do orçamento (Curva ABC, Planilha analítica, aba Insumos).
 * Dispara recálculo do projeto em segundo plano. `cotacao` é opcional — quando
 * informado (aba Insumos, via o modal de cotação), grava fornecedor/data/
 * observações junto (ver upsertAvulsoInsumo); chamadores que só querem trocar
 * o preço (edição rápida na Curva ABC/Analítica) continuam funcionando sem
 * precisar informar nada disso.
 */
export async function atualizarPrecoInsumoAction(
  orcamentoId: string,
  codigo: string,
  novoCusto: number,
  extra?: { descricao?: string; unidade?: string; grupo?: string | null },
  cotacao?: CotacaoInsumoInput
): Promise<{ ok: true }> {
  if (!codigo) throw new Error('Código do insumo ausente.')
  if (!Number.isFinite(novoCusto) || novoCusto < 0) throw new Error('Custo inválido.')

  const supabase = await createClient()
  const sb = supabase as any
  const { data: atual } = await sb
    .from('orcamento_insumos')
    .select('custo, fornecedor, data_cotacao, estimado')
    .eq('orcamento_id', orcamentoId)
    .eq('codigo', codigo)
    .is('composicao_id', null)
    .maybeSingle()

  await upsertAvulsoInsumo(sb, orcamentoId, codigo, novoCusto, extra, cotacao)
  recalcularAutoAction(orcamentoId).catch(console.error)

  if (atual?.custo !== novoCusto) {
    const { data: { user } } = await supabase.auth.getUser()
    sb.from('orcamento_insumo_historico_precos').insert({
      orcamento_id: orcamentoId,
      codigo,
      preco_anterior: atual?.custo ?? null,
      preco_novo: novoCusto,
      usuario: user?.email ?? null,
      fornecedor: cotacao?.fornecedor?.trim() || null,
      data_cotacao: cotacao?.dataCotacao || null,
      observacoes: cotacao?.observacoes?.trim() || null,
    }).then(({ error }: any) => { if (error) console.error('[historico-preco]', error) })
  }

  // Auditoria: valor + fornecedor + data da cotação, antes/depois — mesmo
  // mecanismo genérico (historico_alteracoes) já usado em todo o resto do
  // orçamento, só com o payload mais rico.
  const fornecedorNovo = cotacao?.fornecedor?.trim() || null
  const dataCotacaoNovo = cotacao?.dataCotacao || null
  const estimadoNovo = cotacao?.estimado ?? atual?.estimado ?? false
  registrarHistorico(supabase, {
    orcamentoId,
    entidade: 'insumo',
    tipo: 'sucesso',
    acao: 'atualizar_preco_insumo',
    mensagem: `Preço do insumo "${codigo}" alterado de ${atual?.custo ?? '—'} para ${novoCusto}`,
    valorAnterior: atual ? { custo: atual.custo, fornecedor: atual.fornecedor ?? null, data_cotacao: atual.data_cotacao ?? null, estimado: atual.estimado ?? false } : undefined,
    valorNovo: { custo: novoCusto, fornecedor: fornecedorNovo, data_cotacao: dataCotacaoNovo, estimado: estimadoNovo },
  }).catch(console.error)

  return { ok: true }
}
