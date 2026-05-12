import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrcamentoComposicao, CreateComposicaoData, UpdateComposicaoData } from './types'

const TABLE = 'orcamento_composicoes'

export async function getComposicoesByOrcamento(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<OrcamentoComposicao[]> {
  const allData: Omit<OrcamentoComposicao, 'custo_unitario'>[] = []
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
      if (error) throw new Error(`Erro ao buscar composições: ${error.message}`)
      allData.push(...(data as Omit<OrcamentoComposicao, 'custo_unitario'>[]))
      if ((data?.length ?? 0) < BATCH) break
      start += BATCH
    }
  }
  const composicoes = allData

  if (composicoes.length === 0) return []

  // Calcula custo_unitario = Σ(custo_efetivo × indice) por composição.
  // custo_efetivo: usa o custo do avulso (composicao_id IS NULL) com o mesmo código,
  // pois avulsos representam a tabela de preços do orçamento.
  const compIds = composicoes.map((c) => c.id)
  const allInsData: { composicao_id: string; codigo: string; custo: number; indice: number }[] = []
  for (let i = 0; i < compIds.length; i += 100) {
    const { data: lote } = await supabase
      .from('orcamento_insumos')
      .select('composicao_id, codigo, custo, indice')
      .in('composicao_id', compIds.slice(i, i + 100))
    allInsData.push(...((lote ?? []) as { composicao_id: string; codigo: string; custo: number; indice: number }[]))
  }

  // Busca custos dos avulsos para os códigos usados nas composições
  const codigos = [...new Set(allInsData.map((i) => i.codigo).filter(Boolean))]
  const precoMap = new Map<string, number>() // codigo → custo efetivo

  for (let i = 0; i < codigos.length; i += 500) {
    const { data: avs } = await supabase
      .from('orcamento_insumos')
      .select('codigo, custo')
      .eq('orcamento_id', orcamentoId)
      .is('composicao_id', null)
      .in('codigo', codigos.slice(i, i + 500))
    for (const av of (avs ?? []) as { codigo: string; custo: number }[]) {
      precoMap.set(av.codigo, av.custo)
    }
  }

  // Para códigos sem avulso: verifica se é uma composição filha e usa o custo_unitario dela.
  // Passo 1 — calcula custo_unitario de cada composição usando apenas precoMap (avulsos)
  const custoMap: Record<string, number> = {}
  for (const ins of allInsData) {
    if (ins.composicao_id) {
      const c = precoMap.has(ins.codigo) ? precoMap.get(ins.codigo)! : (ins.custo ?? 0)
      custoMap[ins.composicao_id] = (custoMap[ins.composicao_id] ?? 0) + c * (ins.indice ?? 1)
    }
  }

  // Passo 2 — enriquece precoMap com custo_unitario das composições (para itens tipo C)
  for (const c of composicoes) {
    if (!precoMap.has(c.codigo) && custoMap[c.id] !== undefined) {
      precoMap.set(c.codigo, custoMap[c.id])
    }
  }

  // Passo 3 — recalcula com precoMap completo (avulsos + composições filhas)
  const custoMapFinal: Record<string, number> = {}
  for (const ins of allInsData) {
    if (ins.composicao_id) {
      const c = precoMap.has(ins.codigo) ? precoMap.get(ins.codigo)! : (ins.custo ?? 0)
      custoMapFinal[ins.composicao_id] = (custoMapFinal[ins.composicao_id] ?? 0) + c * (ins.indice ?? 1)
    }
  }

  return composicoes.map((c) => ({ ...c, custo_unitario: custoMapFinal[c.id] ?? 0 }))
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
