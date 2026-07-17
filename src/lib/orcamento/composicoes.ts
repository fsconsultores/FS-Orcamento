import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrcamentoComposicao, CreateComposicaoData, UpdateComposicaoData } from './types'
import { fetchAllPaginatedParallel } from './paginate'

const TABLE = 'orcamento_composicoes'

export interface InsumoDeComposicao {
  composicao_id: string
  codigo: string
  descricao: string
  unidade: string
  custo: number
  indice: number
  grupo: string | null
}

export interface ComposicoesByOrcamentoDetalhado {
  /** Deduplicado — mesmo retorno de sempre de getComposicoesByOrcamento. */
  composicoes: OrcamentoComposicao[]
  /**
   * Todos os insumos vinculados a alguma composição do orçamento (dado já
   * buscado internamente para calcular custo_unitario) — quem precisa do
   * vínculo composição→insumos filhos (calcularCodigosUtilizados, export)
   * usa isto em vez de rodar uma nova varredura de orcamento_insumos.
   */
  insumosDeComposicao: InsumoDeComposicao[]
}

/**
 * Versão que expõe também `insumosDeComposicao` (dado já buscado
 * internamente para o cálculo de custo_unitario) — evita que cada chamador
 * que precisa dessa relação (tela de Composições) rode sua própria
 * varredura redundante de orcamento_insumos. `getComposicoesByOrcamento`
 * abaixo é um wrapper fino sobre esta função, mantendo o contrato antigo
 * inalterado.
 */
export async function getComposicoesByOrcamentoDetalhado(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<ComposicoesByOrcamentoDetalhado> {
  const composicoes = await fetchAllPaginatedParallel<Omit<OrcamentoComposicao, 'custo_unitario'>>(
    (from, to) =>
      supabase
        .from('orcamento_composicoes')
        .select('*', { count: 'exact' })
        .eq('orcamento_id', orcamentoId)
        .order('codigo')
        .range(from, to) as any
  )

  if (composicoes.length === 0) return { composicoes: [], insumosDeComposicao: [] }

  // Calcula custo_unitario = Σ(custo_efetivo × indice) por composição.
  // custo_efetivo: usa o custo do avulso (composicao_id IS NULL) com o mesmo código,
  // pois avulsos representam a tabela de preços do orçamento.
  //
  // Busca via vw_insumos_de_composicao (JOIN orcamento_insumos+orcamento_composicoes
  // já feito no banco) filtrando por orcamento_id direto — 1 requisição, em
  // vez de enviar centenas de composicao_id pela URL em lotes de 100 (era o
  // gargalo dominante em orçamentos com muitas composições: Insumos,
  // Composições e Relatórios travando). Colunas: busca o conjunto completo
  // (não só o que o cálculo de custo usa) porque esse mesmo resultado é
  // reaproveitado pela tela de Composições (descrição/unidade/grupo).
  const allInsData = await fetchAllPaginatedParallel<InsumoDeComposicao>(
    (from, to) =>
      supabase
        .from('vw_insumos_de_composicao')
        .select('composicao_id, codigo, descricao, unidade, custo, indice, grupo', { count: 'exact' })
        .eq('orcamento_id', orcamentoId)
        .order('id')
        .range(from, to) as any
  )

  // Busca custos de TODOS os avulsos do orçamento (paginado em paralelo,
  // mesma cautela) — extras não usados por nenhuma composição não custam
  // nada além de memória (o Map só é lido pelos códigos que aparecem em allInsData).
  const precoMap = new Map<string, number>() // codigo → custo efetivo
  const avulsosRows = await fetchAllPaginatedParallel<{ codigo: string; custo: number }>(
    (from, to) =>
      supabase
        .from('orcamento_insumos')
        .select('codigo, custo', { count: 'exact' })
        .eq('orcamento_id', orcamentoId)
        .is('composicao_id', null)
        .order('codigo')
        .range(from, to) as any
  )
  for (const av of avulsosRows) {
    precoMap.set(av.codigo, av.custo)
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

  return {
    composicoes: composicoes.map((c) => ({ ...c, custo_unitario: custoMapFinal[c.id] ?? 0 })),
    insumosDeComposicao: allInsData,
  }
}

export async function getComposicoesByOrcamento(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<OrcamentoComposicao[]> {
  const { composicoes } = await getComposicoesByOrcamentoDetalhado(supabase, orcamentoId)
  return composicoes
}

/**
 * Recalcula o custo_unitario das composições do orçamento e propaga o resultado
 * para os itens da planilha (orcamento_estrutura) com o mesmo código.
 * Deve ser chamado após alterar o custo de um insumo.
 */
export async function sincronizarCustosPlanilha(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<void> {
  const composicoes = await getComposicoesByOrcamento(supabase, orcamentoId)
  if (composicoes.length === 0) return

  const custoPorCodigo = new Map(composicoes.map((c) => [c.codigo, c.custo_unitario]))

  const { data: itens } = await supabase
    .from('orcamento_estrutura')
    .select('id, codigo, custo_unitario')
    .eq('orcamento_id', orcamentoId)
    .eq('tipo', 'item')
    .not('codigo', 'is', null)

  const updates = ((itens ?? []) as { id: string; codigo: string; custo_unitario: number | null }[])
    .filter((item) => custoPorCodigo.has(item.codigo) && custoPorCodigo.get(item.codigo) !== item.custo_unitario)
    .map((item) => ({ id: item.id, custo_unitario: custoPorCodigo.get(item.codigo)! }))

  if (updates.length === 0) return

  // Atualiza item a item: upsert exigiria todas as colunas NOT NULL e violaria as
  // políticas de RLS de INSERT (que verificam orcamento_id, ausente neste payload).
  const BATCH = 10
  for (let i = 0; i < updates.length; i += BATCH) {
    const lote = updates.slice(i, i + BATCH)
    const resultados = await Promise.all(
      lote.map((u) =>
        supabase.from('orcamento_estrutura').update({ custo_unitario: u.custo_unitario }).eq('id', u.id)
      )
    )
    const falha = resultados.find((r) => r.error)
    if (falha?.error) throw new Error(`Erro ao sincronizar custos da planilha: ${falha.error.message}`)
  }
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
