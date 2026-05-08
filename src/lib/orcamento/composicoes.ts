import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrcamentoComposicao, CreateComposicaoData, UpdateComposicaoData } from './types'

const TABLE = 'orcamento_composicoes'

export async function getComposicoesByOrcamento(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<OrcamentoComposicao[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('orcamento_id', orcamentoId)
    .order('codigo')

  if (error) throw new Error(`Erro ao buscar composições: ${error.message}`)
  const composicoes = (data ?? []) as Omit<OrcamentoComposicao, 'custo_unitario'>[]

  if (composicoes.length === 0) return []

  // Calcula custo_unitario = Σ(custo × indice) por composição
  // Paginado em lotes de 100 para não exceder limite de URL do PostgREST
  const compIds = composicoes.map((c) => c.id)
  const allInsData: { composicao_id: string; custo: number; indice: number }[] = []
  for (let i = 0; i < compIds.length; i += 100) {
    const { data: lote } = await supabase
      .from('orcamento_insumos')
      .select('composicao_id, custo, indice')
      .in('composicao_id', compIds.slice(i, i + 100))
    allInsData.push(...((lote ?? []) as { composicao_id: string; custo: number; indice: number }[]))
  }

  const custoMap: Record<string, number> = {}
  for (const ins of allInsData) {
    if (ins.composicao_id) {
      const contribuicao = (ins.custo ?? 0) * (ins.indice ?? 1)
      custoMap[ins.composicao_id] = (custoMap[ins.composicao_id] ?? 0) + contribuicao
    }
  }

  return composicoes.map((c) => ({ ...c, custo_unitario: custoMap[c.id] ?? 0 }))
}

export async function createComposicao(
  supabase: SupabaseClient,
  orcamentoId: string,
  data: CreateComposicaoData
): Promise<OrcamentoComposicao> {
  const { data: created, error } = await supabase
    .from(TABLE)
    .insert({ ...data, orcamento_id: orcamentoId })
    .select()
    .single()

  if (error) throw new Error(`Erro ao criar composição: ${error.message}`)
  return created as OrcamentoComposicao
}

export async function updateComposicao(
  supabase: SupabaseClient,
  orcamentoId: string,
  composicaoId: string,
  data: UpdateComposicaoData
): Promise<OrcamentoComposicao> {
  const { data: updated, error } = await supabase
    .from(TABLE)
    .update(data)
    .eq('id', composicaoId)
    .eq('orcamento_id', orcamentoId) // garante isolamento
    .select()
    .single()

  if (error) throw new Error(`Erro ao atualizar composição: ${error.message}`)
  return updated as OrcamentoComposicao
}

export async function deleteComposicao(
  supabase: SupabaseClient,
  orcamentoId: string,
  composicaoId: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', composicaoId)
    .eq('orcamento_id', orcamentoId) // garante isolamento

  if (error) throw new Error(`Erro ao excluir composição: ${error.message}`)
}

export async function createComposicoesBatch(
  supabase: SupabaseClient,
  orcamentoId: string,
  composicoes: CreateComposicaoData[]
): Promise<OrcamentoComposicao[]> {
  const rows = composicoes.map((c) => ({ ...c, orcamento_id: orcamentoId }))

  const { data, error } = await supabase
    .from(TABLE)
    .insert(rows)
    .select()

  if (error) throw new Error(`Erro ao importar composições: ${error.message}`)
  return data as OrcamentoComposicao[]
}
