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
    /** Opcional: snapshots gerados antes desse campo existir não o têm — restaura como `false`. */
    estimado?: boolean
    estimado_motivo?: string | null
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

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size))
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
      'id, parent_id, planilha_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem, estimado, estimado_motivo',
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

// ─── Aplicação (popular um orçamento a partir de um snapshot) ────────────────
//
// Usado tanto por "Restaurar versão" (orçamentoId = o próprio orçamento, que
// já tem dados a substituir) quanto por "Criar novo orçamento desta versão"
// (orçamentoId = um orçamento recém-criado e vazio — o DELETE de cada etapa
// não encontra nada, e todo o snapshot vira INSERT puro). Em ambos os casos
// as linhas atuais da tabela são apagadas e reinseridas com UUIDs novos,
// remapeando parent_id/planilha_id/composicao_id pelas posições do snapshot
// — nunca reaproveita o id antigo de uma linha.

async function reconciliarPlanilhas(
  sb: any,
  orcamentoId: string,
  planilhas: VersaoSnapshotV1['planilhas']
): Promise<Map<string, string>> {
  const { data: atuais, error } = await sb
    .from('orcamento_planilhas')
    .select('id, ordem')
    .eq('orcamento_id', orcamentoId)
  if (error) throw new Error(`Erro ao ler planilhas atuais: ${error.message}`)

  const atuaisPorOrdem = new Map<number, string>()
  for (const p of atuais ?? []) atuaisPorOrdem.set(p.ordem, p.id)

  const idMap = new Map<string, string>()
  const ordensNoSnapshot = new Set<number>()

  for (const p of planilhas) {
    ordensNoSnapshot.add(p.ordem)
    const idExistente = atuaisPorOrdem.get(p.ordem)
    if (idExistente) {
      const { error: updErr } = await sb
        .from('orcamento_planilhas')
        .update({ nome: p.nome, bdi_global: p.bdi_global, total_custo: p.total_custo, total_com_bdi: p.total_com_bdi })
        .eq('id', idExistente)
      if (updErr) throw new Error(`Erro ao atualizar planilha: ${updErr.message}`)
      idMap.set(p.id, idExistente)
    } else {
      const { data: inserted, error: insErr } = await sb
        .from('orcamento_planilhas')
        .insert({
          orcamento_id: orcamentoId, nome: p.nome, bdi_global: p.bdi_global, ordem: p.ordem,
          total_custo: p.total_custo, total_com_bdi: p.total_com_bdi,
        })
        .select('id')
        .single()
      if (insErr) throw new Error(`Erro ao criar planilha: ${insErr.message}`)
      idMap.set(p.id, inserted.id)
    }
  }

  // Remove planilhas que existiam mas não estão mais no snapshot restaurado.
  for (const [ordem, id] of atuaisPorOrdem) {
    if (!ordensNoSnapshot.has(ordem)) {
      await sb.from('orcamento_planilhas').delete().eq('id', id)
    }
  }

  return idMap
}

async function restaurarComposicoes(
  sb: any,
  orcamentoId: string,
  composicoes: VersaoSnapshotV1['composicoes']
): Promise<Map<string, string>> {
  const { error: delErr } = await sb.from('orcamento_composicoes').delete().eq('orcamento_id', orcamentoId)
  if (delErr) throw new Error(`Erro ao limpar composições: ${delErr.message}`)

  const idMap = new Map<string, string>()
  if (composicoes.length === 0) return idMap

  for (const lote of chunk(composicoes, 500)) {
    const { data: inserted, error } = await sb
      .from('orcamento_composicoes')
      .insert(lote.map(c => ({
        orcamento_id: orcamentoId,
        codigo: c.codigo,
        // Preserva o código exatamente como estava no snapshot.
        codigo_original: c.codigo_original,
        descricao: c.descricao,
        unidade: c.unidade,
        base: c.base,
        custo_unitario: c.custo_unitario,
        calculado_em: null, // força recálculo completo no próximo "Calcular"
      })))
      .select('id')
    if (error) throw new Error(`Erro ao restaurar composições: ${error.message}`)
    lote.forEach((c, i) => idMap.set(c.id, inserted[i].id))
  }
  return idMap
}

async function restaurarInsumos(
  sb: any,
  orcamentoId: string,
  insumos: VersaoSnapshotV1['insumos'],
  compIdMap: Map<string, string>
): Promise<void> {
  const { error: delErr } = await sb.from('orcamento_insumos').delete().eq('orcamento_id', orcamentoId)
  if (delErr) throw new Error(`Erro ao limpar insumos: ${delErr.message}`)
  if (insumos.length === 0) return

  for (const lote of chunk(insumos, 500)) {
    const { error } = await sb
      .from('orcamento_insumos')
      .insert(lote.map(i => ({
        orcamento_id: orcamentoId,
        composicao_id: i.composicao_id ? (compIdMap.get(i.composicao_id) ?? null) : null,
        codigo: i.codigo,
        codigo_original: i.codigo_original, // idem: preserva o código do snapshot
        descricao: i.descricao,
        unidade: i.unidade,
        custo: i.custo,
        grupo: i.grupo,
        base: i.base,
        data_ref: i.data_ref,
        indice: i.indice,
        custo_atualizado_em: null, // força recálculo completo no próximo "Calcular"
      })))
    if (error) throw new Error(`Erro ao restaurar insumos: ${error.message}`)
  }
}

async function restaurarEstrutura(
  sb: any,
  orcamentoId: string,
  estrutura: VersaoSnapshotV1['estrutura'],
  planilhaIdMap: Map<string, string>
): Promise<void> {
  const { error: delErr } = await sb.from('orcamento_estrutura').delete().eq('orcamento_id', orcamentoId)
  if (delErr) throw new Error(`Erro ao limpar estrutura: ${delErr.message}`)
  if (estrutura.length === 0) return

  const idMap = new Map<string, string>()
  const byNivel = new Map<number, VersaoSnapshotV1['estrutura']>()
  for (const it of estrutura) {
    const arr = byNivel.get(it.nivel) ?? []
    arr.push(it)
    byNivel.set(it.nivel, arr)
  }

  for (const nivel of [...byNivel.keys()].sort((a, b) => a - b)) {
    const itens = byNivel.get(nivel)!
    const rows = itens.map(it => ({
      orcamento_id: orcamentoId,
      planilha_id: it.planilha_id ? (planilhaIdMap.get(it.planilha_id) ?? null) : null,
      parent_id: it.parent_id ? (idMap.get(it.parent_id) ?? null) : null,
      numero: it.numero,
      nivel: it.nivel,
      codigo: it.codigo,
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: it.quantidade,
      custo_unitario: it.custo_unitario,
      bdi_especifico: it.bdi_especifico,
      tipo: it.tipo,
      ordem: it.ordem,
      estimado: it.estimado ?? false,
      estimado_motivo: it.estimado_motivo ?? null,
    }))
    const { data: inserted, error } = await sb.from('orcamento_estrutura').insert(rows).select('id')
    if (error) throw new Error(`Erro ao restaurar estrutura (nível ${nivel}): ${error.message}`)
    itens.forEach((it, i) => idMap.set(it.id, inserted[i].id))
  }
}

async function restaurarServicosEstimados(
  sb: any,
  orcamentoId: string,
  servicos: VersaoSnapshotV1['servicosEstimados']
): Promise<void> {
  const { error: delErr } = await sb.from('orcamento_servicos_estimados').delete().eq('orcamento_id', orcamentoId)
  if (delErr) throw new Error(`Erro ao limpar serviços estimados: ${delErr.message}`)
  if (servicos.length === 0) return

  const { error } = await sb
    .from('orcamento_servicos_estimados')
    .insert(servicos.map(s => ({ orcamento_id: orcamentoId, descricao: s.descricao, valor: s.valor, ordem: s.ordem })))
  if (error) throw new Error(`Erro ao restaurar serviços estimados: ${error.message}`)
}

/**
 * Sobrescreve campos de identidade do orçamento (nome/código/cliente) — usado
 * por "Criar novo orçamento desta versão", onde esses três campos vêm do
 * formulário de criação, não do snapshot. `undefined` = mantém o valor do
 * snapshot; `restaurarVersao` chama sem overrides (tudo vem do snapshot).
 */
export type AplicarSnapshotOverrides = Partial<Pick<VersaoSnapshotV1['orcamento'], 'nome_obra' | 'codigo' | 'cliente'>>

/**
 * Popula planilhas, estrutura, composições, insumos, serviços estimados e
 * configurações do orçamento `orcamentoId` a partir de `snapshot`. Faz
 * DELETE+INSERT (nunca UPDATE em massa) porque o número/identidade das linhas
 * pode mudar entre o estado atual e o snapshot — mais simples e correto do
 * que tentar diffar. Não envolve `orcamento_versoes` em nenhum passo.
 */
export async function aplicarSnapshot(
  sb: any,
  orcamentoId: string,
  snapshot: VersaoSnapshotV1,
  overrides?: AplicarSnapshotOverrides
): Promise<void> {
  const orc = { ...snapshot.orcamento, ...overrides }
  const { error: updOrcErr } = await sb
    .from('tabela_orcamentos')
    .update({
      nome_obra: orc.nome_obra,
      cliente: orc.cliente,
      data: orc.data,
      bdi_global: orc.bdi_global,
      codigo: orc.codigo,
      area_total: orc.area_total,
      area_coberta: orc.area_coberta,
      area_equivalente: orc.area_equivalente,
      local: orc.local,
      numeracao_digitos: orc.numeracao_digitos,
      categorias_grafico: orc.categorias_grafico,
    })
    .eq('id', orcamentoId)
  if (updOrcErr) throw new Error(`Erro ao aplicar configurações do orçamento: ${updOrcErr.message}`)

  // Ordem importa: ids remapeados em cada etapa alimentam a etapa seguinte.
  const planilhaIdMap = await reconciliarPlanilhas(sb, orcamentoId, snapshot.planilhas)
  const compIdMap = await restaurarComposicoes(sb, orcamentoId, snapshot.composicoes)
  await restaurarInsumos(sb, orcamentoId, snapshot.insumos, compIdMap)
  await restaurarEstrutura(sb, orcamentoId, snapshot.estrutura, planilhaIdMap)
  await restaurarServicosEstimados(sb, orcamentoId, snapshot.servicosEstimados)
}
