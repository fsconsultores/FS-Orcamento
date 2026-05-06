import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrcamentoInsumo, CreateInsumoData, UpdateInsumoData } from './types'

const TABLE = 'orcamento_insumos'

export async function getInsumosByOrcamento(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<OrcamentoInsumo[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('orcamento_id', orcamentoId)
    .order('codigo')

  if (error) throw new Error(`Erro ao buscar insumos: ${error.message}`)
  return data as OrcamentoInsumo[]
}

export async function createInsumo(
  supabase: SupabaseClient,
  orcamentoId: string,
  data: CreateInsumoData
): Promise<OrcamentoInsumo> {
  const { data: created, error } = await supabase
    .from(TABLE)
    .insert({ ...data, orcamento_id: orcamentoId })
    .select()
    .single()

  if (error) throw new Error(`Erro ao criar insumo: ${error.message}`)
  return created as OrcamentoInsumo
}

export async function updateInsumo(
  supabase: SupabaseClient,
  orcamentoId: string,
  insumoId: string,
  data: UpdateInsumoData
): Promise<OrcamentoInsumo> {
  const { data: updated, error } = await supabase
    .from(TABLE)
    .update(data)
    .eq('id', insumoId)
    .eq('orcamento_id', orcamentoId) // garante isolamento
    .select()
    .single()

  if (error) throw new Error(`Erro ao atualizar insumo: ${error.message}`)
  return updated as OrcamentoInsumo
}

export async function deleteInsumo(
  supabase: SupabaseClient,
  orcamentoId: string,
  insumoId: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', insumoId)
    .eq('orcamento_id', orcamentoId) // garante isolamento

  if (error) throw new Error(`Erro ao excluir insumo: ${error.message}`)
}

export async function createInsumosBatch(
  supabase: SupabaseClient,
  orcamentoId: string,
  insumos: CreateInsumoData[]
): Promise<OrcamentoInsumo[]> {
  const rows = insumos.map((i) => ({ ...i, orcamento_id: orcamentoId }))

  const { data, error } = await supabase
    .from(TABLE)
    .insert(rows)
    .select()

  if (error) throw new Error(`Erro ao importar insumos: ${error.message}`)
  return data as OrcamentoInsumo[]
}
