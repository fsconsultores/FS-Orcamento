import type { SupabaseClient } from '@supabase/supabase-js'
import type { ModoCalculo, CalculoOptions, OrfaosDetectados } from './types'

export interface ConsistenciaReport {
  ok: boolean
  referenciasQuebradas: { itemId: string; numero: string; codigo: string; descricao: string }[]
  composicoesVazias: { id: string; codigo: string; descricao: string }[]
  composicoesOrfas: { id: string; codigo: string; descricao: string }[]
  valoresInvalidos: { itemId: string; numero: string; descricao: string; problema: string }[]
}

const BASES_NACIONAIS = new Set(['SINAPI', 'DNIT', 'DER', 'SUDECAP'])

export interface LogEntry {
  msg: string
  ts: number
}

export interface TotaisPlanilha {
  planilhaId: string
  nome: string
  totalCusto: number
  totalComBdi: number
}

export interface CalculoResult {
  ok: boolean
  logs: LogEntry[]
  composicoesRecalculadas: number
  itensAtualizados: number
  erro?: string
  orfaos?: OrfaosDetectados
  totaisPlanilhas?: TotaisPlanilha[]
}

// ── Helpers internos ──────────────────────────────────────────────────────────

type InsumoRow = {
  composicao_id: string
  codigo: string
  custo: number
  indice: number
  custo_atualizado_em: string | null
}

type ComposicaoRow = {
  id: string
  codigo: string
  calculado_em: string | null
  custo_unitario: number | null
}

async function fetchComposicoes(supabase: SupabaseClient, orcamentoId: string): Promise<ComposicaoRow[]> {
  const { data, error } = await supabase
    .from('orcamento_composicoes')
    .select('id, codigo, calculado_em, custo_unitario')
    .eq('orcamento_id', orcamentoId)
    .is('deleted_at', null)
    .order('codigo')
  if (error) throw new Error(`Erro ao buscar composições: ${error.message}`)
  return (data ?? []) as ComposicaoRow[]
}

async function fetchInsumosPorComps(supabase: SupabaseClient, compIds: string[]): Promise<InsumoRow[]> {
  const allRows: InsumoRow[] = []
  for (let i = 0; i < compIds.length; i += 100) {
    const { data } = await supabase
      .from('orcamento_insumos')
      .select('composicao_id, codigo, custo, indice, custo_atualizado_em')
      .in('composicao_id', compIds.slice(i, i + 100))
    allRows.push(...((data ?? []) as InsumoRow[]))
  }
  return allRows
}

function calcularDirtyIds(
  allComps: ComposicaoRow[],
  allIns: InsumoRow[],
  forcaTodos: boolean
): Set<string> {
  const codigoToId = new Map(allComps.map(c => [c.codigo, c.id]))
  const insByComp = new Map<string, InsumoRow[]>()
  for (const ins of allIns) {
    if (!insByComp.has(ins.composicao_id)) insByComp.set(ins.composicao_id, [])
    insByComp.get(ins.composicao_id)!.push(ins)
  }

  const dirtyIds = new Set<string>()

  for (const comp of allComps) {
    if (forcaTodos || !comp.calculado_em) { dirtyIds.add(comp.id); continue }
    const calculadoTs = new Date(comp.calculado_em).getTime()
    for (const ins of insByComp.get(comp.id) ?? []) {
      if (ins.custo_atualizado_em && new Date(ins.custo_atualizado_em).getTime() > calculadoTs) {
        dirtyIds.add(comp.id)
        break
      }
    }
  }

  // Propagar dirtiness: se sub-composição ficou suja, pai também fica
  let propagou = true
  while (propagou) {
    propagou = false
    for (const ins of allIns) {
      const subCompId = codigoToId.get(ins.codigo)
      if (subCompId && dirtyIds.has(subCompId) && !dirtyIds.has(ins.composicao_id)) {
        dirtyIds.add(ins.composicao_id)
        propagou = true
      }
    }
  }

  return dirtyIds
}

function calcularCustos(
  allComps: ComposicaoRow[],
  allIns: InsumoRow[],
  dirtyIds: Set<string>,
  avulsoPrecos: Map<string, number>
): Map<string, number> {
  const codigoToId = new Map(allComps.map(c => [c.codigo, c.id]))

  const insByComp = new Map<string, InsumoRow[]>()
  for (const ins of allIns) {
    if (!insByComp.has(ins.composicao_id)) insByComp.set(ins.composicao_id, [])
    insByComp.get(ins.composicao_id)!.push(ins)
  }

  // Inicia com os custos armazenados como ponto de partida para convergência
  const custoPorId = new Map<string, number>(allComps.map(c => [c.id, c.custo_unitario ?? 0]))

  // Convergência iterativa: resolve qualquer profundidade de aninhamento.
  // Cada pass propaga custos de sub-composições para os pais.
  // Converge em no máximo (profundidade + 1) iterações.
  const MAX_PASSES = 8
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false
    for (const comp of allComps) {
      const insumos = insByComp.get(comp.id) ?? []
      if (insumos.length === 0) continue
      let custo = 0
      for (const ins of insumos) {
        const subId = codigoToId.get(ins.codigo)
        let preco: number
        if (subId != null) {
          // Insumo é sub-composição: usa custo calculado (ou avulso, ou custo armazenado)
          preco = custoPorId.get(subId) ?? avulsoPrecos.get(ins.codigo) ?? ins.custo ?? 0
        } else {
          // Insumo simples: preço avulso tem prioridade (atualizado pelo usuário na aba Insumos)
          preco = avulsoPrecos.get(ins.codigo) ?? ins.custo ?? 0
        }
        custo += preco * (ins.indice ?? 1)
      }
      const prev = custoPorId.get(comp.id) ?? 0
      if (Math.abs(custo - prev) > 0.0001) {
        changed = true
        custoPorId.set(comp.id, custo)
      }
    }
    if (!changed) break
  }

  // Monta resultado:
  // - Com insumos: custo calculado pelo convergência iterativa
  // - Sem insumos: fallback — usa preço avulso com o mesmo código da composição (se existir)
  // - Sem nada: não inclui → valor existente na estrutura permanece intacto
  const resultado = new Map<string, number>()
  for (const comp of allComps) {
    if (!dirtyIds.has(comp.id)) continue
    const hasInsumos = (insByComp.get(comp.id)?.length ?? 0) > 0
    if (hasInsumos) {
      resultado.set(comp.id, custoPorId.get(comp.id) ?? 0)
    } else {
      const precoAvulso = avulsoPrecos.get(comp.codigo)
      if (precoAvulso !== undefined && precoAvulso > 0) resultado.set(comp.id, precoAvulso)
    }
  }
  return resultado
}

async function persistirComposicoes(
  supabase: SupabaseClient,
  comps: ComposicaoRow[],
  custoPorId: Map<string, number>,
  agora: string
): Promise<void> {
  // Só persiste composições que foram efetivamente calculadas (têm insumos)
  const compsCalculadas = comps.filter(c => custoPorId.has(c.id))
  const BATCH = 20
  for (let i = 0; i < compsCalculadas.length; i += BATCH) {
    const lote = compsCalculadas.slice(i, i + BATCH)
    const results = await Promise.all(
      lote.map(c =>
        supabase
          .from('orcamento_composicoes')
          .update({ custo_unitario: custoPorId.get(c.id)!, calculado_em: agora })
          .eq('id', c.id)
      )
    )
    const falha = results.find(r => r.error)
    if (falha?.error) throw new Error(`Erro ao salvar composição: ${falha.error.message}`)
  }
}

async function atualizarEstrutura(
  supabase: SupabaseClient,
  orcamentoId: string,
  planilhaIds: string[] | null,
  custoPorCodigo: Map<string, number>
): Promise<number> {
  let query = supabase
    .from('orcamento_estrutura')
    .select('id, codigo, custo_unitario')
    .eq('orcamento_id', orcamentoId)
    .eq('tipo', 'item')
    .not('codigo', 'is', null)

  if (planilhaIds && planilhaIds.length === 1) {
    query = query.eq('planilha_id', planilhaIds[0])
  } else if (planilhaIds && planilhaIds.length > 1) {
    query = query.in('planilha_id', planilhaIds)
  }

  const { data: itens, error: itensErr } = await query
  if (itensErr) throw new Error(`Erro ao buscar itens da planilha: ${itensErr.message}`)

  const updates = ((itens ?? []) as { id: string; codigo: string; custo_unitario: number | null }[])
    .filter(item => custoPorCodigo.has(item.codigo) && custoPorCodigo.get(item.codigo) !== item.custo_unitario)
    .map(item => ({ id: item.id, custo_unitario: custoPorCodigo.get(item.codigo)! }))

  if (updates.length === 0) return 0

  const BATCH = 20
  for (let i = 0; i < updates.length; i += BATCH) {
    const lote = updates.slice(i, i + BATCH)
    const results = await Promise.all(
      lote.map(u =>
        supabase.from('orcamento_estrutura').update({ custo_unitario: u.custo_unitario }).eq('id', u.id)
      )
    )
    const falha = results.find(r => r.error)
    if (falha?.error) throw new Error(`Erro ao atualizar planilha: ${falha.error.message}`)
  }

  return updates.length
}

async function persistirTotaisPlanilha(
  supabase: SupabaseClient,
  orcamentoId: string,
  planilhaIds: string[]
): Promise<TotaisPlanilha[]> {
  const agora = new Date().toISOString()
  const resultado: TotaisPlanilha[] = []

  for (const planilhaId of planilhaIds) {
    const { data: planilha } = await supabase
      .from('orcamento_planilhas')
      .select('nome, bdi_global')
      .eq('id', planilhaId)
      .single()

    const bdi = planilha?.bdi_global ?? 0

    const { data: itens } = await supabase
      .from('orcamento_estrutura')
      .select('custo_unitario, quantidade, bdi_especifico')
      .eq('orcamento_id', orcamentoId)
      .eq('planilha_id', planilhaId)
      .eq('tipo', 'item')

    let totalCusto = 0
    let totalComBdi = 0
    for (const item of (itens ?? []) as { custo_unitario: number | null; quantidade: number | null; bdi_especifico: number | null }[]) {
      const custo = (item.custo_unitario ?? 0) * (item.quantidade ?? 1)
      const bdiItem = item.bdi_especifico ?? bdi
      totalCusto += custo
      totalComBdi += custo * (1 + bdiItem / 100)
    }

    await supabase
      .from('orcamento_planilhas')
      .update({ total_custo: totalCusto, total_com_bdi: totalComBdi, ultima_calculo_em: agora, invalidado_em: null })
      .eq('id', planilhaId)

    resultado.push({ planilhaId, nome: planilha?.nome ?? planilhaId, totalCusto, totalComBdi })
  }

  return resultado
}

// ── API Pública ───────────────────────────────────────────────────────────────

/**
 * Registra um evento no log de auditoria do orçamento.
 * Falha silenciosamente para não interromper o fluxo principal.
 */
export async function registrarLog(
  supabase: SupabaseClient,
  orcamentoId: string,
  planilhaId: string | null,
  acao: string,
  mensagem: string,
  detalhes?: Record<string, unknown>
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('orcamento_logs').insert({
      orcamento_id: orcamentoId,
      planilha_id: planilhaId ?? null,
      user_id: user?.id ?? null,
      acao,
      mensagem,
      detalhes: detalhes ?? null,
    })
  } catch {
    // log não-crítico
  }
}

/**
 * Detecta composições e insumos órfãos:
 * - Composições não referenciadas em nenhuma estrutura de nenhuma planilha do projeto
 * - Insumos que pertencem a essas composições
 */
export async function detectarOrfaos(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<OrfaosDetectados> {
  // Busca todos os códigos de composições usados nas estruturas do projeto
  const { data: estrutura } = await supabase
    .from('orcamento_estrutura')
    .select('codigo')
    .eq('orcamento_id', orcamentoId)
    .eq('tipo', 'item')
    .not('codigo', 'is', null)

  const codigosUsados = new Set((estrutura ?? []).map((e: { codigo: string }) => e.codigo))

  // Busca todas as composições não deletadas do projeto
  const { data: comps } = await supabase
    .from('orcamento_composicoes')
    .select('id, codigo, descricao')
    .eq('orcamento_id', orcamentoId)
    .is('deleted_at', null)

  const orphanComps = ((comps ?? []) as { id: string; codigo: string; descricao: string }[])
    .filter(c => !codigosUsados.has(c.codigo))

  if (orphanComps.length === 0) return { composicoes: [], insumos: 0 }

  const orphanIds = orphanComps.map(c => c.id)
  let orphanInsumos = 0
  for (let i = 0; i < orphanIds.length; i += 100) {
    const { count } = await supabase
      .from('orcamento_insumos')
      .select('id', { count: 'exact', head: true })
      .in('composicao_id', orphanIds.slice(i, i + 100))
      .is('deleted_at', null)
    orphanInsumos += count ?? 0
  }

  return { composicoes: orphanComps, insumos: orphanInsumos }
}

/**
 * Aplica soft-delete nas composições e insumos órfãos confirmados.
 * Nunca remove composições de bases nacionais (SINAPI, DNIT, DER, SUDECAP).
 */
export async function executarLimpeza(
  supabase: SupabaseClient,
  orcamentoId: string,
  composicaoIds: string[],
  userId: string
): Promise<{ composicoesRemovidas: number; insumosRemovidos: number; ignorados: number }> {
  if (composicaoIds.length === 0) return { composicoesRemovidas: 0, insumosRemovidos: 0, ignorados: 0 }

  // Filtra bases nacionais
  const { data: todasComps } = await supabase
    .from('orcamento_composicoes')
    .select('id, base')
    .in('id', composicaoIds)
    .is('deleted_at', null)

  const permitidos = ((todasComps ?? []) as { id: string; base: string | null }[])
    .filter(c => !BASES_NACIONAIS.has((c.base ?? '').toUpperCase().trim()))
    .map(c => c.id)

  const ignorados = composicaoIds.length - permitidos.length
  if (permitidos.length === 0) return { composicoesRemovidas: 0, insumosRemovidos: 0, ignorados }

  const agora = new Date().toISOString()

  // Soft-delete insumos
  let insumosRemovidos = 0
  for (let i = 0; i < permitidos.length; i += 100) {
    const { data } = await supabase
      .from('orcamento_insumos')
      .update({ deleted_at: agora, deleted_by: userId })
      .in('composicao_id', permitidos.slice(i, i + 100))
      .is('deleted_at', null)
      .select('id')
    insumosRemovidos += (data ?? []).length
  }

  // Soft-delete composições
  const { data: compsRemovidas } = await supabase
    .from('orcamento_composicoes')
    .update({ deleted_at: agora, deleted_by: userId })
    .in('id', permitidos)
    .is('deleted_at', null)
    .select('id')

  return {
    composicoesRemovidas: (compsRemovidas ?? []).length,
    insumosRemovidos,
    ignorados,
  }
}

/**
 * Recalcula o custo_unitario de uma única composição e propaga para a estrutura.
 * Mais eficiente que o motor completo para mudanças pontuais.
 */
export async function recalcularComposicaoUnica(
  supabase: SupabaseClient,
  composicaoId: string,
  orcamentoId: string
): Promise<{ custoUnitario: number; itensAtualizados: number }> {
  // 1. Busca código da composição
  const { data: comp } = await supabase
    .from('orcamento_composicoes')
    .select('id, codigo')
    .eq('id', composicaoId)
    .single()

  if (!comp?.codigo) return { custoUnitario: 0, itensAtualizados: 0 }

  // 2. Busca itens (insumos) da composição
  const { data: insumos } = await supabase
    .from('orcamento_insumos')
    .select('codigo, custo, indice, grupo')
    .eq('composicao_id', composicaoId)
    .is('deleted_at', null)

  const rows = (insumos ?? []) as { codigo: string; custo: number; indice: number; grupo: string | null }[]

  // 3. Busca preços: sub-composições (pelo custo calculado) e avulsos (pelo preço da aba Insumos)
  const todosCodigosInsumos = [...new Set(rows.map(r => r.codigo).filter(Boolean))]
  const subPrecos = new Map<string, number>()
  const avulsoPrecos = new Map<string, number>()

  if (todosCodigosInsumos.length > 0) {
    const [{ data: subs }, { data: avs }] = await Promise.all([
      supabase
        .from('orcamento_composicoes')
        .select('codigo, custo_unitario')
        .eq('orcamento_id', orcamentoId)
        .in('codigo', todosCodigosInsumos)
        .is('deleted_at', null),
      supabase
        .from('orcamento_insumos')
        .select('codigo, custo')
        .eq('orcamento_id', orcamentoId)
        .is('composicao_id', null)
        .in('codigo', todosCodigosInsumos),
    ])
    for (const s of (subs ?? []) as { codigo: string; custo_unitario: number }[]) {
      subPrecos.set(s.codigo, s.custo_unitario ?? 0)
    }
    for (const av of (avs ?? []) as { codigo: string; custo: number }[]) {
      if (av.custo) avulsoPrecos.set(av.codigo, av.custo)
    }
  }

  // 4. Calcula custo total: sub-comp > avulso > custo armazenado no insumo
  let custoUnitario = 0
  for (const r of rows) {
    let preco: number
    if (subPrecos.has(r.codigo)) {
      preco = subPrecos.get(r.codigo)!
    } else {
      preco = avulsoPrecos.get(r.codigo) ?? r.custo ?? 0
    }
    custoUnitario += preco * (r.indice ?? 1)
  }

  // 5. Persiste em orcamento_composicoes
  const agora = new Date().toISOString()
  await supabase
    .from('orcamento_composicoes')
    .update({ custo_unitario: custoUnitario, calculado_em: agora })
    .eq('id', composicaoId)

  // 6. Atualiza itens da estrutura que usam este código
  const { data: itens } = await supabase
    .from('orcamento_estrutura')
    .select('id, custo_unitario, planilha_id')
    .eq('orcamento_id', orcamentoId)
    .eq('codigo', comp.codigo)
    .eq('tipo', 'item')

  const paraAtualizar = ((itens ?? []) as { id: string; custo_unitario: number | null; planilha_id: string | null }[])
    .filter(i => i.custo_unitario !== custoUnitario)

  for (let i = 0; i < paraAtualizar.length; i += 20) {
    await Promise.all(
      paraAtualizar.slice(i, i + 20).map(u =>
        supabase.from('orcamento_estrutura').update({ custo_unitario: custoUnitario }).eq('id', u.id)
      )
    )
  }

  // 7. Atualiza totais das planilhas afetadas
  const planilhaIds = [...new Set(paraAtualizar.map(i => i.planilha_id).filter((x): x is string => !!x))]
  if (planilhaIds.length > 0) {
    await persistirTotaisPlanilha(supabase, orcamentoId, planilhaIds)
  }

  return { custoUnitario, itensAtualizados: paraAtualizar.length }
}

/**
 * Verifica a consistência do projeto sem modificar dados.
 * Retorna referências quebradas, composições vazias, órfãs e valores inválidos.
 */
export async function verificarConsistencia(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<ConsistenciaReport> {
  const [
    { data: estruturaItems },
    { data: todasComps },
  ] = await Promise.all([
    supabase
      .from('orcamento_estrutura')
      .select('id, numero, codigo, descricao, custo_unitario, quantidade, tipo')
      .eq('orcamento_id', orcamentoId),
    supabase
      .from('orcamento_composicoes')
      .select('id, codigo, descricao')
      .eq('orcamento_id', orcamentoId)
      .is('deleted_at', null),
  ])

  const compSet = new Map((todasComps ?? []).map((c: { id: string; codigo: string; descricao: string }) => [c.codigo, c]))
  const codigosNaEstrutura = new Set<string>()

  const items = (estruturaItems ?? []) as {
    id: string; numero: string; codigo: string | null
    descricao: string; custo_unitario: number | null; quantidade: number | null; tipo: string
  }[]

  // Referências quebradas e valores inválidos
  const referenciasQuebradas: ConsistenciaReport['referenciasQuebradas'] = []
  const valoresInvalidos: ConsistenciaReport['valoresInvalidos'] = []

  for (const item of items) {
    if (item.tipo !== 'item') continue
    if (item.codigo) {
      codigosNaEstrutura.add(item.codigo)
      if (!compSet.has(item.codigo)) {
        referenciasQuebradas.push({ itemId: item.id, numero: item.numero, codigo: item.codigo, descricao: item.descricao })
      }
    }
    if (item.quantidade === null || item.quantidade <= 0) {
      valoresInvalidos.push({ itemId: item.id, numero: item.numero, descricao: item.descricao, problema: 'Quantidade inválida ou nula' })
    }
    if (item.codigo && (item.custo_unitario === null || item.custo_unitario === 0)) {
      valoresInvalidos.push({ itemId: item.id, numero: item.numero, descricao: item.descricao, problema: 'Custo unitário zero (composição pode não ter sido calculada)' })
    }
  }

  // Composições vazias (sem insumos ativos)
  const composicoesVazias: ConsistenciaReport['composicoesVazias'] = []
  const compIds = (todasComps ?? []).map((c: { id: string }) => c.id)
  for (let i = 0; i < compIds.length; i += 100) {
    const { data: contagem } = await supabase
      .from('orcamento_insumos')
      .select('composicao_id')
      .in('composicao_id', compIds.slice(i, i + 100))
      .is('deleted_at', null)
    const comComInsumos = new Set((contagem ?? []).map((r: { composicao_id: string }) => r.composicao_id))
    for (const comp of (todasComps ?? []) as { id: string; codigo: string; descricao: string }[]) {
      if (compIds.slice(i, i + 100).includes(comp.id) && !comComInsumos.has(comp.id)) {
        composicoesVazias.push({ id: comp.id, codigo: comp.codigo, descricao: comp.descricao })
      }
    }
  }

  // Composições órfãs (não referenciadas na estrutura)
  const composicoesOrfas = ((todasComps ?? []) as { id: string; codigo: string; descricao: string }[])
    .filter(c => !codigosNaEstrutura.has(c.codigo))

  const totalProblemas = referenciasQuebradas.length + composicoesVazias.length +
    composicoesOrfas.length + valoresInvalidos.length

  return {
    ok: totalProblemas === 0,
    referenciasQuebradas,
    composicoesVazias,
    composicoesOrfas,
    valoresInvalidos,
  }
}

/**
 * Motor de cálculo principal com 4 modos de operação:
 *
 * - 'planilha': Delta detection, atualiza só a planilha ativa
 * - 'todas':    Delta detection, atualiza todas as planilhas do projeto
 * - 'forca':    Ignora delta, recalcula todas as composições e atualiza a planilha ativa
 * - 'limpar':   Recalcula tudo + detecta órfãos (não remove — retorna para confirmação)
 */
export async function executarCalculo(
  supabase: SupabaseClient,
  orcamentoId: string,
  optionsOrPlanilhaId: CalculoOptions | string | null
): Promise<CalculoResult> {
  // Retrocompatibilidade: aceita string ou null diretamente
  let options: CalculoOptions
  if (typeof optionsOrPlanilhaId === 'string' || optionsOrPlanilhaId === null) {
    options = { modo: 'planilha', planilhaId: optionsOrPlanilhaId }
  } else {
    options = optionsOrPlanilhaId
  }

  const { modo, planilhaId } = options
  const logs: LogEntry[] = []
  const log = (msg: string) => logs.push({ msg, ts: Date.now() })
  const forca = modo === 'forca' || modo === 'limpar'

  try {
    log(`Iniciando cálculo [modo: ${modo}]...`)

    // ── Determina quais planilhas serão atualizadas na estrutura ─────────────
    let planilhaIdsParaAtualizar: string[]

    if (modo === 'todas' || modo === 'limpar' || (modo === 'forca' && !planilhaId)) {
      const { data: todas } = await supabase
        .from('orcamento_planilhas')
        .select('id')
        .eq('orcamento_id', orcamentoId)
      planilhaIdsParaAtualizar = (todas ?? []).map((p: { id: string }) => p.id)
      log(`Atualizando ${planilhaIdsParaAtualizar.length} planilha(s)...`)
    } else {
      planilhaIdsParaAtualizar = planilhaId ? [planilhaId] : []
    }

    // ── Buscar composições e insumos ─────────────────────────────────────────
    const allComps = await fetchComposicoes(supabase, orcamentoId)
    if (allComps.length === 0) {
      log('Nenhuma composição encontrada.')
      log('Cálculo concluído.')
      return { ok: true, logs, composicoesRecalculadas: 0, itensAtualizados: 0 }
    }

    const compIds = allComps.map(c => c.id)
    const allIns = await fetchInsumosPorComps(supabase, compIds)

    log(`Verificando insumos alterados... (${allComps.length} composição(ões))`)

    // ── Delta detection / força ───────────────────────────────────────────────
    const dirtyIds = calcularDirtyIds(allComps, allIns, forca)
    log(`${dirtyIds.size} composição(ões) a recalcular.`)

    if (dirtyIds.size === 0 && allComps.length > 0) {
      log('Nenhuma alteração detectada desde o último cálculo.')
      const totaisPlanilhas = planilhaIdsParaAtualizar.length > 0
        ? await persistirTotaisPlanilha(supabase, orcamentoId, planilhaIdsParaAtualizar)
        : undefined
      log('Cálculo concluído com sucesso.')
      await registrarLog(supabase, orcamentoId, planilhaId ?? null, 'calculo', `Cálculo executado [${modo}] — nenhuma alteração`, { modo, composicoesRecalculadas: 0 })
      return { ok: true, logs, composicoesRecalculadas: 0, itensAtualizados: 0, totaisPlanilhas }
    }

    // ── Buscar preços avulsos (têm prioridade sobre custo armazenado nos insumos) ──
    log('Recalculando composições...')
    const avulsoPrecos = new Map<string, number>()
    {
      // Inclui códigos de insumos das composições + códigos das próprias composições
      // para suportar o caso em que o avulso tem o mesmo código da composição (mapeamento direto)
      const codigosIns  = allIns.map(i => i.codigo).filter(Boolean)
      const codigosComp = allComps.filter(c => dirtyIds.has(c.id)).map(c => c.codigo).filter(Boolean)
      const codigos = [...new Set([...codigosIns, ...codigosComp])]
      for (let i = 0; i < codigos.length; i += 500) {
        const { data: avs } = await supabase
          .from('orcamento_insumos')
          .select('codigo, custo')
          .eq('orcamento_id', orcamentoId)
          .is('composicao_id', null)
          .in('codigo', codigos.slice(i, i + 500))
        for (const av of (avs ?? []) as { codigo: string; custo: number }[]) {
          if (av.custo) avulsoPrecos.set(av.codigo, av.custo)
        }
      }
    }

    // ── Calcular custos ───────────────────────────────────────────────────────
    const custoPorId = calcularCustos(allComps, allIns, dirtyIds, avulsoPrecos)

    // ── Persistir composições ─────────────────────────────────────────────────
    const dirtyComps = allComps.filter(c => dirtyIds.has(c.id))
    const agora = new Date().toISOString()
    await persistirComposicoes(supabase, dirtyComps, custoPorId, agora)

    // ── Atualizar estrutura ───────────────────────────────────────────────────
    log('Atualizando planilha...')
    // Só inclui composições efetivamente calculadas — sem insumos não entra no mapa
    // e o item da estrutura permanece com o custo original (importado)
    const custoPorCodigo = new Map(
      dirtyComps
        .filter(c => custoPorId.has(c.id))
        .map(c => [c.codigo, custoPorId.get(c.id)!])
    )
    const itensAtualizados = await atualizarEstrutura(supabase, orcamentoId, planilhaIdsParaAtualizar, custoPorCodigo)

    // ── Persistir totais ──────────────────────────────────────────────────────
    let totaisPlanilhas: TotaisPlanilha[] | undefined
    if (planilhaIdsParaAtualizar.length > 0) {
      log('Salvando totais das planilhas...')
      totaisPlanilhas = await persistirTotaisPlanilha(supabase, orcamentoId, planilhaIdsParaAtualizar)
    }

    // ── Detectar órfãos (modo limpar) ─────────────────────────────────────────
    let orfaos: OrfaosDetectados | undefined
    if (modo === 'limpar') {
      log('Detectando composições e insumos órfãos...')
      orfaos = await detectarOrfaos(supabase, orcamentoId)
      if (orfaos.composicoes.length > 0) {
        log(`${orfaos.composicoes.length} composição(ões) órfã(s) encontrada(s) (${orfaos.insumos} insumo(s)).`)
      } else {
        log('Nenhuma composição órfã encontrada.')
      }
    }

    log('Cálculo concluído com sucesso.')
    await registrarLog(supabase, orcamentoId, planilhaId ?? null, 'calculo', `Cálculo executado [${modo}] — ${dirtyIds.size} composição(ões)`, {
      modo,
      composicoesRecalculadas: dirtyIds.size,
      itensAtualizados,
      orfaosComposicoes: orfaos?.composicoes.length,
    })

    return {
      ok: true,
      logs,
      composicoesRecalculadas: dirtyIds.size,
      itensAtualizados,
      orfaos,
      totaisPlanilhas,
    }
  } catch (err) {
    const msg = (err as Error).message
    log(`Erro: ${msg}`)
    await registrarLog(supabase, orcamentoId, planilhaId ?? null, 'calculo_erro', `Erro no cálculo [${modo}]: ${msg}`, { modo })
    return {
      ok: false,
      logs,
      composicoesRecalculadas: 0,
      itensAtualizados: 0,
      erro: msg,
    }
  }
}
