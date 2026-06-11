import type { SupabaseClient } from '@supabase/supabase-js'
import { computeAbcCurves, type AbcItem, type EstruturaItemBasico, type InsumoComposicaoBasico } from '../curva-abc'
import { getInsumosByOrcamento } from './insumos'
import { getComposicoesByOrcamento } from './composicoes'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CategoriaCusto = 'mat' | 'mo' | 'terceiros'

export interface CadernoNode {
  id: string
  numero: string
  nivel: number
  codigo: string | null
  descricao: string
  unidade: string | null
  quantidade: number | null
  tipo: 'grupo' | 'item'
  // custos unitários (apenas itens-folha)
  custoMat: number
  custoMo: number
  custoTerceiros: number
  custoUnitario: number
  // totais (item: unitário × quantidade; grupo: soma dos filhos)
  totalMat: number
  totalMo: number
  totalTerceiros: number
  total: number
  percentual: number
  filhos: CadernoNode[]
}

export type PlanilhaAnaliticaRow =
  | { tipo: 'grupo'; numero: string; descricao: string }
  | { tipo: 'item'; numero: string; codigo: string; descricao: string; unidade: string; custoUnitario: number; custoTotal: number }
  | { tipo: 'insumo'; codigo: string; descricao: string; unidade: string; indice: number; custoUnit: number; custoTotal: number }

export interface ListaInsumoItem {
  codigo: string
  descricao: string
  unidade: string
  grupo: string
  custo: number
  quantidade: number
  total: number
}

export interface ListaInsumoGrupo {
  label: string
  items: ListaInsumoItem[]
}

export interface ServicoEstimado {
  descricao: string
  valor: number
}

export interface CadernoData {
  orcamento: {
    nome_obra: string
    codigo: string | null
    cliente: string | null
    local: string | null
    data: string | null
    bdi_global: number
    area_total: number | null
    area_coberta: number | null
    area_equivalente: number | null
  }
  arvore: CadernoNode[]
  totalGeral: number
  servicosEstimados: ServicoEstimado[]
  totalServicosEstimados: number
  abcInsumos: AbcItem[]
  abcServicos: AbcItem[]
  planilhaAnalitica: PlanilhaAnaliticaRow[]
  listaInsumos: ListaInsumoGrupo[]
}

interface EstruturaFullItem {
  id: string
  parent_id: string | null
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
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classificarGrupo(grupo: string | null | undefined): CategoriaCusto {
  const g = (grupo ?? '').trim().toUpperCase()
  if (g === 'S' || g.startsWith('SER')) return 'terceiros'
  if (g === 'H' || g === 'HH' || g.startsWith('MO')) return 'mo'
  return 'mat'
}

function classificarLabel(grupo: string | null | undefined): string {
  const g = (grupo ?? '').trim().toUpperCase()
  if (g === 'E') return 'Equipamento'
  if (g === 'H' || g === 'HH') return 'Mão de Obra'
  if (g === 'S' || g.startsWith('SER')) return 'Serviço de Terceiros'
  return 'Material'
}

const LABEL_ORDEM = ['Equipamento', 'Mão de Obra', 'Material', 'Serviço de Terceiros']

interface Breakdown { mat: number; mo: number; terceiros: number }

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function getCadernoData(supabase: SupabaseClient, orcamentoId: string): Promise<CadernoData> {
  const sb = supabase as any

  const [{ data: orc }, { data: estrutura }, { data: servicosEstimadosRows }, composicoes, todosInsumos] = await Promise.all([
    sb.from('tabela_orcamentos')
      .select('nome_obra, codigo, cliente, local, data, bdi_global, area_total, area_coberta, area_equivalente')
      .eq('id', orcamentoId)
      .single(),
    sb.from('orcamento_estrutura')
      .select('id, parent_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem')
      .eq('orcamento_id', orcamentoId)
      .order('nivel', { ascending: true })
      .order('ordem', { ascending: true }),
    sb.from('orcamento_servicos_estimados')
      .select('descricao, valor')
      .eq('orcamento_id', orcamentoId)
      .order('ordem', { ascending: true }),
    getComposicoesByOrcamento(supabase, orcamentoId),
    getInsumosByOrcamento(supabase, orcamentoId),
  ])

  const estItems: EstruturaFullItem[] = estrutura ?? []

  // Insumos dentro de composições (paginado)
  const allInsumos: InsumoComposicaoBasico[] = []
  {
    const BATCH = 1000
    let start = 0
    while (true) {
      const { data } = await sb
        .from('orcamento_insumos')
        .select('codigo, descricao, unidade, custo, indice, composicao_id, grupo')
        .eq('orcamento_id', orcamentoId)
        .not('composicao_id', 'is', null)
        .range(start, start + BATCH - 1)
      if (!data || data.length === 0) break
      allInsumos.push(...data)
      if (data.length < BATCH) break
      start += BATCH
    }
  }

  // ── Mapas auxiliares ─────────────────────────────────────────────────────────
  const compIdToCode = new Map<string, string>()
  const compCodeToId = new Map<string, string>()
  const compCodesSet = new Set<string>()
  for (const c of composicoes) {
    compIdToCode.set(c.id, c.codigo)
    compCodeToId.set(c.codigo, c.id)
    compCodesSet.add(c.codigo)
  }

  // codigo → { custo, grupo } a partir da lista deduplicada de insumos
  const insumoInfoMap = new Map<string, { custo: number; grupo: string | null }>()
  for (const ins of todosInsumos) {
    insumoInfoMap.set(ins.codigo, { custo: ins.custo, grupo: ins.grupo })
  }

  // codigo → custo efetivo (avulsos/insumos + custo_unitario calculado das composições)
  const precoEfetivoMap = new Map<string, number>()
  for (const [codigo, info] of insumoInfoMap) precoEfetivoMap.set(codigo, info.custo)
  for (const comp of composicoes) precoEfetivoMap.set(comp.codigo, comp.custo_unitario)

  // composicao_id → insumos da composição
  const compInsumosByCompId = new Map<string, InsumoComposicaoBasico[]>()
  for (const ins of allInsumos) {
    const arr = compInsumosByCompId.get(ins.composicao_id) ?? []
    arr.push(ins)
    compInsumosByCompId.set(ins.composicao_id, arr)
  }

  // ── Breakdown MAT/MO/TERCEIROS por composição (2 passos) ─────────────────────
  const breakdown1 = new Map<string, Breakdown>()
  for (const [compId, insumosArr] of compInsumosByCompId) {
    const acc: Breakdown = { mat: 0, mo: 0, terceiros: 0 }
    for (const ins of insumosArr) {
      if (compCodesSet.has(ins.codigo)) continue
      const cat = classificarGrupo(ins.grupo)
      const efetivo = insumoInfoMap.get(ins.codigo)?.custo ?? ins.custo
      acc[cat] += efetivo * ins.indice
    }
    breakdown1.set(compId, acc)
  }

  const breakdownByCode = new Map<string, Breakdown>()
  for (const [compId, insumosArr] of compInsumosByCompId) {
    const base = breakdown1.get(compId) ?? { mat: 0, mo: 0, terceiros: 0 }
    const acc: Breakdown = { ...base }
    for (const ins of insumosArr) {
      if (!compCodesSet.has(ins.codigo)) continue
      const subCompId = compCodeToId.get(ins.codigo)
      const sub = subCompId ? breakdown1.get(subCompId) : undefined
      const efetivo = precoEfetivoMap.get(ins.codigo) ?? ins.custo
      const valTotal = efetivo * ins.indice
      const subTotal = sub ? sub.mat + sub.mo + sub.terceiros : 0
      if (sub && subTotal > 0) {
        acc.mat += valTotal * (sub.mat / subTotal)
        acc.mo += valTotal * (sub.mo / subTotal)
        acc.terceiros += valTotal * (sub.terceiros / subTotal)
      } else {
        acc.mat += valTotal
      }
    }
    const codigo = compIdToCode.get(compId)
    if (codigo) breakdownByCode.set(codigo, acc)
  }

  // ── Árvore (Planilha de Preços Unitários / Planilha de Orçamento) ────────────
  interface RawNode extends EstruturaFullItem { filhos: RawNode[] }
  const map = new Map<string, RawNode>()
  for (const item of estItems) map.set(item.id, { ...item, filhos: [] })
  const roots: RawNode[] = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id)!.filhos.push(node)
    else roots.push(node)
  }
  function sortByOrdem(nodes: RawNode[]) {
    nodes.sort((a, b) => a.ordem - b.ordem)
    for (const n of nodes) sortByOrdem(n.filhos)
  }
  sortByOrdem(roots)

  function custoUnitarioEfetivo(raw: EstruturaFullItem): number {
    let custoUnitario = raw.custo_unitario ?? 0
    if (raw.codigo && breakdownByCode.has(raw.codigo)) {
      const b = breakdownByCode.get(raw.codigo)!
      const breakdownTotal = b.mat + b.mo + b.terceiros
      if (custoUnitario === 0) custoUnitario = breakdownTotal
    }
    return custoUnitario
  }

  // ── Itens "- Estimado" → Serviços Estimados (B) ──────────────────────────────
  // Grupos/itens cujo nome termina em "- Estimado" não compõem o Total Orçado
  // (A) nem as demais seções do caderno; seu custo entra como Serviço
  // Estimado (B). Quando o marcador está num grupo, cada filho direto vira
  // um serviço estimado (com o custo de toda a sua subárvore).
  const ESTIMADO_RE = /\s*-\s*estimados?\s*$/i

  function sumLeaves(raw: RawNode): number {
    if (raw.filhos.length === 0) return custoUnitarioEfetivo(raw) * (raw.quantidade ?? 0)
    return raw.filhos.reduce((s, f) => s + sumLeaves(f), 0)
  }

  const idsEstimados = new Set<string>()
  const autoServicosEstimados: ServicoEstimado[] = []

  function marcarSubarvore(raw: RawNode) {
    idsEstimados.add(raw.id)
    for (const filho of raw.filhos) marcarSubarvore(filho)
  }

  function detectarEstimados(nodes: RawNode[]) {
    for (const node of nodes) {
      if (ESTIMADO_RE.test(node.descricao)) {
        marcarSubarvore(node)
        if (node.tipo === 'item') {
          autoServicosEstimados.push({ descricao: node.descricao.replace(ESTIMADO_RE, '').trim(), valor: sumLeaves(node) })
        } else {
          for (const filho of node.filhos) {
            autoServicosEstimados.push({ descricao: filho.descricao, valor: sumLeaves(filho) })
          }
        }
        continue
      }
      detectarEstimados(node.filhos)
    }
  }
  detectarEstimados(roots)

  function removerEstimados(nodes: RawNode[]): RawNode[] {
    const result: RawNode[] = []
    for (const node of nodes) {
      if (idsEstimados.has(node.id)) continue
      const filhos = removerEstimados(node.filhos)
      if (node.tipo === 'grupo' && filhos.length === 0) continue
      result.push({ ...node, filhos })
    }
    return result
  }
  const arvoreRoots = removerEstimados(roots)

  function buildNode(raw: RawNode): CadernoNode {
    if (raw.filhos.length === 0) {
      const quantidade = raw.quantidade ?? 0
      let custoMat = 0, custoMo = 0, custoTerceiros = 0
      const custoUnitario = custoUnitarioEfetivo(raw)

      if (raw.codigo && breakdownByCode.has(raw.codigo)) {
        const b = breakdownByCode.get(raw.codigo)!
        const breakdownTotal = b.mat + b.mo + b.terceiros
        if (breakdownTotal > 0) {
          const factor = custoUnitario / breakdownTotal
          custoMat = b.mat * factor
          custoMo = b.mo * factor
          custoTerceiros = b.terceiros * factor
        } else {
          custoMat = custoUnitario
        }
      } else {
        const cat = classificarGrupo(raw.codigo ? insumoInfoMap.get(raw.codigo)?.grupo : null)
        if (cat === 'mat') custoMat = custoUnitario
        else if (cat === 'mo') custoMo = custoUnitario
        else custoTerceiros = custoUnitario
      }

      const total = custoUnitario * quantidade
      return {
        id: raw.id, numero: raw.numero, nivel: raw.nivel, codigo: raw.codigo,
        descricao: raw.descricao, unidade: raw.unidade, quantidade: raw.quantidade, tipo: raw.tipo,
        custoMat, custoMo, custoTerceiros, custoUnitario,
        totalMat: custoMat * quantidade, totalMo: custoMo * quantidade, totalTerceiros: custoTerceiros * quantidade, total,
        percentual: 0,
        filhos: [],
      }
    }

    const filhos = raw.filhos.map(buildNode)
    const totalMat = filhos.reduce((s, f) => s + f.totalMat, 0)
    const totalMo = filhos.reduce((s, f) => s + f.totalMo, 0)
    const totalTerceiros = filhos.reduce((s, f) => s + f.totalTerceiros, 0)
    const total = filhos.reduce((s, f) => s + f.total, 0)
    return {
      id: raw.id, numero: raw.numero, nivel: raw.nivel, codigo: raw.codigo,
      descricao: raw.descricao, unidade: raw.unidade, quantidade: raw.quantidade, tipo: raw.tipo,
      custoMat: 0, custoMo: 0, custoTerceiros: 0, custoUnitario: 0,
      totalMat, totalMo, totalTerceiros, total,
      percentual: 0,
      filhos,
    }
  }

  const arvore = arvoreRoots.map(buildNode)
  const totalGeral = arvore.reduce((s, n) => s + n.total, 0)

  function aplicarPercentual(nodes: CadernoNode[]) {
    for (const n of nodes) {
      n.percentual = totalGeral > 0 ? (n.total / totalGeral) * 100 : 0
      aplicarPercentual(n.filhos)
    }
  }
  aplicarPercentual(arvore)

  // ── Curva ABC (Insumos / Serviços) ────────────────────────────────────────────
  const estItemsAbc: EstruturaItemBasico[] = estItems
    .filter(i => i.tipo === 'item' && !idsEstimados.has(i.id))
    .map(i => ({ codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, custo_unitario: i.custo_unitario }))
  const { abcServicos, abcInsumos } = computeAbcCurves(estItemsAbc, composicoes.map(c => ({ id: c.id, codigo: c.codigo })), allInsumos)

  // ── Planilha Analítica ────────────────────────────────────────────────────────
  // Segue a ordem da Planilha de Orçamento (grupos e itens), intercalando, para
  // cada item com composição detalhada, os insumos dessa composição logo abaixo.
  function buildPlanilhaAnalitica(nodes: CadernoNode[]): PlanilhaAnaliticaRow[] {
    const rows: PlanilhaAnaliticaRow[] = []
    for (const node of nodes) {
      if (node.tipo === 'grupo') {
        rows.push({ tipo: 'grupo', numero: node.numero, descricao: node.descricao })
        rows.push(...buildPlanilhaAnalitica(node.filhos))
        continue
      }

      rows.push({
        tipo: 'item',
        numero: node.numero,
        codigo: node.codigo ?? '',
        descricao: node.descricao,
        unidade: node.unidade ?? '',
        custoUnitario: node.custoUnitario,
        custoTotal: node.total,
      })

      const compId = node.codigo ? compCodeToId.get(node.codigo) : undefined
      const insumosArr = compId ? compInsumosByCompId.get(compId) : undefined
      if (insumosArr && insumosArr.length > 0) {
        for (const ins of insumosArr.slice().sort((a, b) => a.codigo.localeCompare(b.codigo))) {
          const custoUnit = precoEfetivoMap.get(ins.codigo) ?? ins.custo
          rows.push({
            tipo: 'insumo',
            codigo: ins.codigo,
            descricao: ins.descricao,
            unidade: ins.unidade ?? '',
            indice: ins.indice,
            custoUnit,
            custoTotal: custoUnit * ins.indice,
          })
        }
      }
    }
    return rows
  }

  const planilhaAnalitica = buildPlanilhaAnalitica(arvore)

  // ── Consumo total de cada insumo no orçamento (expande composições recursivamente) ──
  const consumoMap = new Map<string, number>()
  function acumularConsumo(codigo: string, qtd: number, visitados: Set<string>) {
    if (compCodesSet.has(codigo)) {
      if (visitados.has(codigo)) return
      const compId = compCodeToId.get(codigo)
      const insumosArr = compId ? compInsumosByCompId.get(compId) : undefined
      if (!insumosArr) return
      const proximosVisitados = new Set(visitados).add(codigo)
      for (const ins of insumosArr) acumularConsumo(ins.codigo, qtd * ins.indice, proximosVisitados)
    } else {
      consumoMap.set(codigo, (consumoMap.get(codigo) ?? 0) + qtd)
    }
  }
  function percorrerItens(nodes: CadernoNode[]) {
    for (const n of nodes) {
      if (n.tipo === 'item' && n.codigo) acumularConsumo(n.codigo, n.quantidade ?? 0, new Set())
      percorrerItens(n.filhos)
    }
  }
  percorrerItens(arvore)

  // ── Lista de Insumos (agrupada por categoria) ────────────────────────────────
  const gruposMap = new Map<string, ListaInsumoItem[]>()
  for (const ins of todosInsumos) {
    if (compCodesSet.has(ins.codigo)) continue
    const label = classificarLabel(ins.grupo)
    const quantidade = consumoMap.get(ins.codigo) ?? 0
    const arr = gruposMap.get(label) ?? []
    arr.push({
      codigo: ins.codigo,
      descricao: ins.descricao,
      unidade: ins.unidade,
      grupo: label,
      custo: ins.custo,
      quantidade,
      total: quantidade * ins.custo,
    })
    gruposMap.set(label, arr)
  }
  const listaInsumos: ListaInsumoGrupo[] = LABEL_ORDEM
    .filter(label => gruposMap.has(label))
    .map(label => ({
      label,
      items: gruposMap.get(label)!.sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')),
    }))

  const servicosEstimadosManuais: ServicoEstimado[] = (servicosEstimadosRows ?? []).map((s: any) => ({
    descricao: s.descricao,
    valor: s.valor ?? 0,
  }))
  const servicosEstimados: ServicoEstimado[] = [...autoServicosEstimados, ...servicosEstimadosManuais]
  const totalServicosEstimados = servicosEstimados.reduce((sum, s) => sum + s.valor, 0)

  return {
    orcamento: {
      nome_obra: orc?.nome_obra ?? '',
      codigo: orc?.codigo ?? null,
      cliente: orc?.cliente ?? null,
      local: orc?.local ?? null,
      data: orc?.data ?? null,
      bdi_global: orc?.bdi_global ?? 0,
      area_total: orc?.area_total ?? null,
      area_coberta: orc?.area_coberta ?? null,
      area_equivalente: orc?.area_equivalente ?? null,
    },
    arvore,
    totalGeral,
    servicosEstimados,
    totalServicosEstimados,
    abcInsumos,
    abcServicos,
    planilhaAnalitica,
    listaInsumos,
  }
}
