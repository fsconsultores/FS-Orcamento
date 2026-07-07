import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface VersaoSnapshotV1 {
  formatVersion: 1
  orcamento: {
    nome_obra: string
    cliente: string | null
    data: string
    bdi_global: number
    codigo: string | null
    area_total: number | null
    area_coberta: number | null
    area_equivalente: number | null
    local: string | null
    numeracao_digitos: number[] | null
    categorias_grafico: Record<string, string> | null
  }
  planilhas: {
    id: string
    nome: string
    bdi_global: number
    ordem: number
    total_custo: number | null
    total_com_bdi: number | null
  }[]
  estrutura: {
    id: string
    parent_id: string | null
    planilha_id: string | null
    numero: string
    nivel: number
    codigo: string | null
    descricao: string
    unidade: string | null
    quantidade: number | null
    custo_unitario: number | null
    bdi_especifico: number | null
    tipo: 'grupo' | 'item'
    ordem: number
  }[]
  composicoes: {
    id: string
    codigo: string
    codigo_original: string | null
    descricao: string
    unidade: string
    base: string | null
    custo_unitario: number | null
    calculado_em: string | null
  }[]
  insumos: {
    id: string
    composicao_id: string | null
    codigo: string
    codigo_original: string | null
    descricao: string
    unidade: string
    custo: number
    grupo: string | null
    base: string | null
    data_ref: string | null
    indice: number
  }[]
  servicosEstimados: {
    descricao: string
    valor: number
    ordem: number
  }[]
}

export interface OrcamentoVersaoResumo {
  id: string
  mensagem: string
  autor_email: string | null
  criado_em: string
  origem: 'manual' | 'pre_restore'
}

// ─── Captura ─────────────────────────────────────────────────────────────────

async function fetchPaginado<T>(
  sb: SupabaseClient,
  table: string,
  select: string,
  orcamentoId: string,
  extra?: (q: any) => any
): Promise<T[]> {
  const BATCH = 1000
  const out: T[] = []
  let start = 0
  while (true) {
    let query = (sb as any).from(table).select(select).eq('orcamento_id', orcamentoId).range(start, start + BATCH - 1)
    if (extra) query = extra(query)
    const { data, error } = await query
    if (error) throw new Error(`Erro ao capturar ${table}: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < BATCH) break
    start += BATCH
  }
  return out
}

export async function capturarSnapshot(supabase: SupabaseClient, orcamentoId: string): Promise<VersaoSnapshotV1> {
  const sb = supabase as any

  const [{ data: orc, error: orcErr }, { data: planilhas, error: planErr }] = await Promise.all([
    sb.from('tabela_orcamentos')
      .select('nome_obra, cliente, data, bdi_global, codigo, area_total, area_coberta, area_equivalente, local, numeracao_digitos, categorias_grafico')
      .eq('id', orcamentoId)
      .single(),
    sb.from('orcamento_planilhas')
      .select('id, nome, bdi_global, ordem, total_custo, total_com_bdi')
      .eq('orcamento_id', orcamentoId)
      .order('ordem'),
  ])
  if (orcErr) throw new Error(`Erro ao capturar orçamento: ${orcErr.message}`)
  if (planErr) throw new Error(`Erro ao capturar planilhas: ${planErr.message}`)

  const [estrutura, composicoes, insumos, servicosEstimadosRows] = await Promise.all([
    fetchPaginado<VersaoSnapshotV1['estrutura'][number]>(
      sb, 'orcamento_estrutura',
      'id, parent_id, planilha_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem',
      orcamentoId
    ),
    fetchPaginado<VersaoSnapshotV1['composicoes'][number]>(
      sb, 'orcamento_composicoes',
      'id, codigo, codigo_original, descricao, unidade, base, custo_unitario, calculado_em',
      orcamentoId,
      (q: any) => q.is('deleted_at', null)
    ),
    fetchPaginado<VersaoSnapshotV1['insumos'][number]>(
      sb, 'orcamento_insumos',
      'id, composicao_id, codigo, codigo_original, descricao, unidade, custo, grupo, base, data_ref, indice',
      orcamentoId,
      (q: any) => q.is('deleted_at', null)
    ),
    sb.from('orcamento_servicos_estimados')
      .select('descricao, valor, ordem')
      .eq('orcamento_id', orcamentoId)
      .order('ordem'),
  ])
  if (servicosEstimadosRows.error) throw new Error(`Erro ao capturar serviços estimados: ${servicosEstimadosRows.error.message}`)

  return {
    formatVersion: 1,
    orcamento: {
      nome_obra: orc?.nome_obra ?? '',
      cliente: orc?.cliente ?? null,
      data: orc?.data ?? '',
      bdi_global: orc?.bdi_global ?? 0,
      codigo: orc?.codigo ?? null,
      area_total: orc?.area_total ?? null,
      area_coberta: orc?.area_coberta ?? null,
      area_equivalente: orc?.area_equivalente ?? null,
      local: orc?.local ?? null,
      numeracao_digitos: orc?.numeracao_digitos ?? null,
      categorias_grafico: orc?.categorias_grafico ?? null,
    },
    planilhas: (planilhas ?? []) as VersaoSnapshotV1['planilhas'],
    estrutura,
    composicoes,
    insumos,
    servicosEstimados: (servicosEstimadosRows.data ?? []) as VersaoSnapshotV1['servicosEstimados'],
  }
}
