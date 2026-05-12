import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrcamentoInsumo, CreateInsumoData, UpdateInsumoData } from './types'

const TABLE = 'orcamento_insumos'

export async function getInsumosByOrcamento(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<OrcamentoInsumo[]> {
  // 1. IDs das composições deste orçamento
  const { data: comps } = await supabase
    .from('orcamento_composicoes')
    .select('id')
    .eq('orcamento_id', orcamentoId)
  const compIds = ((comps ?? []) as { id: string }[]).map(c => c.id)

  // 2. Todos os insumos vinculados a composições deste orçamento
  //    Paginado em lotes de 100 para não exceder o limite de URL do PostgREST
  //    (sem filtro de orcamento_id — captura dados com orcamento_id inconsistente)
  let porComp: OrcamentoInsumo[] = []
  for (let i = 0; i < compIds.length; i += 100) {
    const { data } = await supabase
      .from(TABLE)
      .select('*')
      .in('composicao_id', compIds.slice(i, i + 100))
      .order('codigo')
    porComp.push(...((data ?? []) as OrcamentoInsumo[]))
  }

  // Auto-correção: atualiza orcamento_id incorreto para garantir consistência futura
  if (porComp.length > 0) {
    const idsErrados = porComp
      .filter(ins => ins.orcamento_id !== orcamentoId)
      .map(ins => ins.id)
    if (idsErrados.length > 0) {
      for (let i = 0; i < idsErrados.length; i += 500) {
        await supabase
          .from(TABLE)
          .update({ orcamento_id: orcamentoId })
          .in('id', idsErrados.slice(i, i + 500))
      }
    }
  }

  // 3. Todos os insumos com orcamento_id correto (inclui avulsos) — paginado para passar do limite de 1000
  const todosArr: OrcamentoInsumo[] = []
  {
    const BATCH = 1000
    let start = 0
    while (true) {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('orcamento_id', orcamentoId)
        .order('codigo')
        .range(start, start + BATCH - 1)
      if (error) throw new Error(`Erro ao buscar insumos: ${error.message}`)
      todosArr.push(...(data as OrcamentoInsumo[]))
      if ((data?.length ?? 0) < BATCH) break
      start += BATCH
    }
  }

  // Avulsos (composicao_id=null) têm custo explícito — devem ter prioridade na deduplicação.
  // Insumos de composições (custo=0) só aparecem se não houver avulso com o mesmo código.
  const avulsos = todosArr.filter(ins => ins.composicao_id === null)
  const avulsosCodigos = new Set(avulsos.map(ins => ins.codigo ?? ''))
  const compSemAvulso = porComp.filter(ins => !avulsosCodigos.has(ins.codigo ?? ''))
  const seen = new Set<string>()
  return [...avulsos, ...compSemAvulso].filter(ins => {
    const key = ins.codigo ?? ''
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
