'use server'

import { createClient } from '@/lib/supabase/server'
import { upsertAvulsoInsumo } from '@/lib/orcamento/insumos'
import { recalcularAutoAction } from './planilha/calcular-action'
import { registrarHistorico } from '@/lib/log'

export interface SugestaoParaAplicar {
  codigo: string
  valor: number
  fornecedor: string | null
  dataCotacao: string | null
  origemOrcamentoNome: string
}

/**
 * Aplica em lote preços sugeridos por cotações de OUTRAS obras (ver
 * getSugestoesCotacaoCrossOrcamento) — resolve a dor de preencher preço
 * "um por um" no modal de cotação quando a mesma cotação já existe em
 * outra obra. Reaproveita upsertAvulsoInsumo (já grava a cotação e
 * sincroniza cópias embutidas em composições); dispara UM recálculo e UMA
 * linha de auditoria para o lote inteiro, não uma por item.
 */
export async function aplicarSugestoesCotacaoAction(
  orcamentoId: string,
  itens: SugestaoParaAplicar[]
): Promise<{ aplicados: number }> {
  if (itens.length === 0) return { aplicados: 0 }

  const supabase = await createClient()
  const sb = supabase as any

  const codigos = itens.map((i) => i.codigo)
  const { data: atuais, error: atuaisErr } = await sb
    .from('orcamento_insumos')
    .select('codigo, custo')
    .eq('orcamento_id', orcamentoId)
    .in('codigo', codigos)
    .is('composicao_id', null)
  if (atuaisErr) throw new Error(`Erro ao buscar preços atuais: ${atuaisErr.message}`)
  const custoAnteriorPorCodigo = new Map<string, number>(
    (atuais ?? []).map((a: { codigo: string; custo: number }) => [a.codigo, a.custo])
  )

  const { data: { user } } = await supabase.auth.getUser()
  const historicoRows: Record<string, unknown>[] = []

  for (const item of itens) {
    if (!item.codigo) continue
    await upsertAvulsoInsumo(sb, orcamentoId, item.codigo, item.valor, undefined, {
      fornecedor: item.fornecedor,
      dataCotacao: item.dataCotacao,
      observacoes: `Sugestão aplicada de outra obra (${item.origemOrcamentoNome})`,
    })

    const anterior = custoAnteriorPorCodigo.get(item.codigo) ?? null
    if (anterior !== item.valor) {
      historicoRows.push({
        orcamento_id: orcamentoId,
        codigo: item.codigo,
        preco_anterior: anterior,
        preco_novo: item.valor,
        usuario: user?.email ?? null,
        fornecedor: item.fornecedor,
        data_cotacao: item.dataCotacao,
        observacoes: `Sugestão aplicada de outra obra (${item.origemOrcamentoNome})`,
      })
    }
  }

  if (historicoRows.length > 0) {
    sb.from('orcamento_insumo_historico_precos').insert(historicoRows)
      .then(({ error }: any) => { if (error) console.error('[sugestoes-cotacao] historico:', error) })
  }

  recalcularAutoAction(orcamentoId).catch(console.error)

  registrarHistorico(supabase, {
    orcamentoId,
    entidade: 'insumo',
    tipo: 'sucesso',
    acao: 'aplicar_sugestoes_cotacao',
    mensagem: `${itens.length} preço(s) preenchido(s) a partir de cotações de outras obras`,
  }).catch(console.error)

  return { aplicados: itens.length }
}
