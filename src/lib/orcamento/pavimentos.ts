import type { SupabaseClient } from '@supabase/supabase-js'

export interface OrcamentoPavimento {
  id?: string
  descricao: string
  unidade: string
  area_total: number
  area_equivalente: number
  area_coberta: number
}

export async function getPavimentosByOrcamento(
  supabase: SupabaseClient,
  orcamentoId: string,
): Promise<OrcamentoPavimento[]> {
  const sb = supabase as any
  const { data, error } = await sb
    .from('orcamento_pavimentos')
    .select('id, descricao, unidade, area_total, area_equivalente, area_coberta')
    .eq('orcamento_id', orcamentoId)
    .order('ordem', { ascending: true })
  if (error) throw new Error(`Erro ao buscar pavimentos: ${error.message}`)
  return data ?? []
}

/**
 * Substitui a lista inteira de pavimentos do orçamento — mesmo padrão
 * "delete tudo + reinsere" já usado pra orcamento_servicos_estimados (ver
 * salvarDadosCadastrais), independente/desacoplado dele de propósito: os
 * pavimentos são editados só na tela de Configurações, então salvar aqui
 * nunca corre o risco de sobrescrever dados de outro formulário que não
 * conhece a lista atual de pavimentos.
 */
export async function salvarPavimentos(
  supabase: SupabaseClient,
  orcamentoId: string,
  pavimentos: OrcamentoPavimento[],
): Promise<void> {
  const sb = supabase as any

  const { error: delError } = await sb.from('orcamento_pavimentos').delete().eq('orcamento_id', orcamentoId)
  if (delError) throw new Error(`Erro ao salvar pavimentos: ${delError.message}`)

  if (pavimentos.length === 0) return

  const { error: insError } = await sb.from('orcamento_pavimentos').insert(
    pavimentos.map((p, i) => ({
      orcamento_id: orcamentoId,
      descricao: p.descricao,
      unidade: p.unidade || 'M2',
      area_total: p.area_total,
      area_equivalente: p.area_equivalente,
      area_coberta: p.area_coberta,
      ordem: i,
    }))
  )
  if (insError) throw new Error(`Erro ao salvar pavimentos: ${insError.message}`)
}
