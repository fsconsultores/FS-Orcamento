import type { SupabaseClient } from '@supabase/supabase-js'
import { computeAbcCurves, computeAbcCurvaUnica, type AbcItem, type AbcItemComCategoria, type EstruturaItemBasico, type InsumoComposicaoBasico, type InsumoAvulsoBasico } from '../curva-abc'
import { getInsumosByOrcamentoDetalhado } from './insumos'
import { getComposicoesByOrcamento } from './composicoes'
import { CATEGORIAS_DISTRIBUICAO_CUSTOS, CATEGORIA_OUTROS, CORES_DISTRIBUICAO_CUSTOS, sugerirCategoria } from './categorias-grafico'
import { classificarCategoriaAnalitica, type CategoriaAnalitica } from './analitica-filtros'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CategoriaCusto = 'mat' | 'mo' | 'terceiros'

export type AbcClasse = 'A' | 'B' | 'C'

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
  // classificação Curva ABC (apenas itens-folha; null para grupos)
  classeAbc: AbcClasse | null
  filhos: CadernoNode[]
}

export type PlanilhaAnaliticaRow =
  | { tipo: 'grupo'; numero: string; descricao: string }
  | { tipo: 'item'; numero: string; codigo: string; descricao: string; unidade: string; quantidade: number; custoUnitario: number; custoTotal: number; classeAbc: AbcClasse | null }
  | { tipo: 'insumo'; codigo: string; descricao: string; unidade: string; indice: number; custoUnit: number; custoTotal: number; nivel: number; categoria: CategoriaAnalitica; quantidadeTotalItem: number }

export interface InsumoConsumoRow {
  codigo: string
  descricao: string
  unidade: string
  /** consumo total no orçamento inteiro (não por unidade de serviço) */
  quantidade: number
  custoUnit: number
  custoTotal: number
  categoria: CategoriaAnalitica
}

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

export interface DistribuicaoCustoItem {
  numero: string
  label: string
  value: number
  percentual: number
  color: string
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
  abcGeral: AbcItemComCategoria[]
  planilhaAnalitica: PlanilhaAnaliticaRow[]
  planilhaAnaliticaDecomposta: PlanilhaAnaliticaRow[]
  insumosConsumo: InsumoConsumoRow[]
  listaInsumos: ListaInsumoGrupo[]
  distribuicaoCustos: DistribuicaoCustoItem[]
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

export async function getCadernoData(
  supabase: SupabaseClient,
  orcamentoId: string,
  planilhaIds?: string[] | null,
): Promise<CadernoData> {
  const sb = supabase as any

  let estruturaQuery = sb.from('orcamento_estrutura')
    .select('id, parent_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem')
    .eq('orcamento_id', orcamentoId)
  if (planilhaIds && planilhaIds.length > 0) estruturaQuery = estruturaQuery.in('planilha_id', planilhaIds)
  estruturaQuery = estruturaQuery
    .order('nivel', { ascending: true })
    .order('ordem', { ascending: true })

  const [{ data: orc }, { data: estrutura }, { data: servicosEstimadosRows }, composicoes, { insumos: todosInsumos, insumosDeComposicao }] = await Promise.all([
    sb.from('tabela_orcamentos')
      .select('nome_obra, codigo, cliente, local, data, bdi_global, area_total, area_coberta, area_equivalente, categorias_grafico')
      .eq('id', orcamentoId)
      .single(),
    estruturaQuery,
    sb.from('orcamento_servicos_estimados')
      .select('descricao, valor')
      .eq('orcamento_id', orcamentoId)
      .order('ordem', { ascending: true }),
    getComposicoesByOrcamento(supabase, orcamentoId),
    getInsumosByOrcamentoDetalhado(supabase, orcamentoId),
  ])

  const estItems: EstruturaFullItem[] = estrutura ?? []

  // Insumos dentro de composições — já buscados por getInsumosByOrcamentoDetalhado
  // (composicao_id é sempre não-nulo aqui, pela própria query que os produziu).
  const allInsumos: InsumoComposicaoBasico[] = insumosDeComposicao.map(ins => ({
    codigo: ins.codigo,
    descricao: ins.descricao,
    unidade: ins.unidade,
    custo: ins.custo,
    indice: ins.indice,
    composicao_id: ins.composicao_id!,
    grupo: ins.grupo,
  }))

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
        classeAbc: null,
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
      classeAbc: null,
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

  // ── Classificação Curva ABC por item — mesmo critério da Planilha Orçamentária:
  // itens-folha ordenados por valor decrescente, classe pela % acumulada sobre o total.
  function collectLeaves(nodes: CadernoNode[], out: CadernoNode[] = []): CadernoNode[] {
    for (const n of nodes) {
      if (n.filhos.length === 0) out.push(n)
      else collectLeaves(n.filhos, out)
    }
    return out
  }
  if (totalGeral > 0) {
    const leaves = collectLeaves(arvore).filter(n => n.total > 0).sort((a, b) => b.total - a.total)
    let acumulado = 0
    const classeMap = new Map<string, AbcClasse>()
    for (const leaf of leaves) {
      acumulado += (leaf.total / totalGeral) * 100
      classeMap.set(leaf.id, acumulado <= 80 ? 'A' : acumulado <= 95 ? 'B' : 'C')
    }
    function aplicarClasse(nodes: CadernoNode[]) {
      for (const n of nodes) {
        n.classeAbc = classeMap.get(n.id) ?? null
        aplicarClasse(n.filhos)
      }
    }
    aplicarClasse(arvore)
  }

  // ── Distribuição dos Custos (A) — agrupamento em categorias fixas ───────────
  // Cada grupo de nível 1 é mapeado para uma das categorias fixas do gráfico de
  // rosca (configurável em Configurações, com sugestão automática por palavras-
  // chave como padrão), e os totais são somados por categoria.
  const categoriasMap: Record<string, string> = orc?.categorias_grafico ?? {}
  const totalPorCategoria = new Map<string, number>()
  for (const n of arvore) {
    if (n.total <= 0) continue
    const categoria = categoriasMap[n.numero] || sugerirCategoria(n.descricao)
    totalPorCategoria.set(categoria, (totalPorCategoria.get(categoria) ?? 0) + n.total)
  }
  const distribuicaoCustos: DistribuicaoCustoItem[] = []
  CATEGORIAS_DISTRIBUICAO_CUSTOS.forEach((categoria, i) => {
    const value = totalPorCategoria.get(categoria) ?? 0
    if (value <= 0) return
    distribuicaoCustos.push({
      numero: String(i + 1).padStart(2, '0'),
      label: categoria,
      value,
      percentual: totalGeral > 0 ? (value / totalGeral) * 100 : 0,
      color: CORES_DISTRIBUICAO_CUSTOS[categoria],
    })
  })
  const totalOutros = totalPorCategoria.get(CATEGORIA_OUTROS) ?? 0
  if (totalOutros > 0) {
    distribuicaoCustos.push({
      numero: '',
      label: CATEGORIA_OUTROS,
      value: totalOutros,
      percentual: totalGeral > 0 ? (totalOutros / totalGeral) * 100 : 0,
      color: CORES_DISTRIBUICAO_CUSTOS[CATEGORIA_OUTROS],
    })
  }

  // ── Curva ABC (Insumos / Serviços) ────────────────────────────────────────────
  const estItemsAbc: EstruturaItemBasico[] = estItems
    .filter(i => i.tipo === 'item' && !idsEstimados.has(i.id))
    .map(i => ({ codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, custo_unitario: i.custo_unitario }))
  const insumosAvulsos: InsumoAvulsoBasico[] = todosInsumos
    .filter(ins => ins.composicao_id === null)
    .map(ins => ({ codigo: ins.codigo ?? '', descricao: ins.descricao ?? '', custo: ins.custo ?? 0 }))
  const composicoesBasicas = composicoes.map(c => ({ id: c.id, codigo: c.codigo, descricao: c.descricao }))
  const { abcServicos, abcInsumos } = computeAbcCurves(estItemsAbc, composicoesBasicas, allInsumos, insumosAvulsos)
  const abcGeral = computeAbcCurvaUnica(estItemsAbc, composicoesBasicas, allInsumos, insumosAvulsos)

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
        quantidade: node.quantidade ?? 0,
        custoUnitario: node.custoUnitario,
        custoTotal: node.total,
        classeAbc: node.classeAbc,
      })

      const compId = node.codigo ? compCodeToId.get(node.codigo) : undefined
      const insumosArr = compId ? compInsumosByCompId.get(compId) : undefined
      if (insumosArr && insumosArr.length > 0) {
        const quantidadeItem = node.quantidade ?? 0
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
            nivel: 1,
            categoria: classificarCategoriaAnalitica(insumoInfoMap.get(ins.codigo)?.grupo),
            quantidadeTotalItem: ins.indice * quantidadeItem,
          })
        }
      }
    }
    return rows
  }

  const planilhaAnalitica = buildPlanilhaAnalitica(arvore)

  // ── Planilha Analítica Decomposta ────────────────────────────────────────────
  // Igual à Planilha Analítica, mas quando um insumo é, na verdade, o código de
  // outra composição (sub-composição), expande recursivamente os insumos dela
  // também, acumulando o índice (índice do pai × índice do filho) e a
  // profundidade (nivel) para indentação no export.
  function buildPlanilhaAnaliticaDecomposta(nodes: CadernoNode[]): PlanilhaAnaliticaRow[] {
    const rows: PlanilhaAnaliticaRow[] = []

    function expandirInsumo(ins: InsumoComposicaoBasico, indiceAcumulado: number, nivel: number, visitados: Set<string>, quantidadeItem: number) {
      const custoUnit = precoEfetivoMap.get(ins.codigo) ?? ins.custo
      rows.push({
        tipo: 'insumo',
        codigo: ins.codigo,
        descricao: ins.descricao,
        unidade: ins.unidade ?? '',
        indice: indiceAcumulado,
        custoUnit,
        custoTotal: custoUnit * indiceAcumulado,
        nivel,
        categoria: classificarCategoriaAnalitica(insumoInfoMap.get(ins.codigo)?.grupo),
        quantidadeTotalItem: indiceAcumulado * quantidadeItem,
      })

      const subCompId = compCodeToId.get(ins.codigo)
      if (!subCompId || visitados.has(ins.codigo)) return
      const subInsumos = compInsumosByCompId.get(subCompId)
      if (!subInsumos || subInsumos.length === 0) return

      const proximosVisitados = new Set(visitados).add(ins.codigo)
      for (const sub of subInsumos.slice().sort((a, b) => a.codigo.localeCompare(b.codigo))) {
        expandirInsumo(sub, indiceAcumulado * sub.indice, nivel + 1, proximosVisitados, quantidadeItem)
      }
    }

    for (const node of nodes) {
      if (node.tipo === 'grupo') {
        rows.push({ tipo: 'grupo', numero: node.numero, descricao: node.descricao })
        rows.push(...buildPlanilhaAnaliticaDecomposta(node.filhos))
        continue
      }

      rows.push({
        tipo: 'item',
        numero: node.numero,
        codigo: node.codigo ?? '',
        descricao: node.descricao,
        unidade: node.unidade ?? '',
        quantidade: node.quantidade ?? 0,
        custoUnitario: node.custoUnitario,
        custoTotal: node.total,
        classeAbc: node.classeAbc,
      })

      const compId = node.codigo ? compCodeToId.get(node.codigo) : undefined
      const insumosArr = compId ? compInsumosByCompId.get(compId) : undefined
      if (insumosArr && insumosArr.length > 0) {
        const visitadosRaiz = new Set(node.codigo ? [node.codigo] : [])
        const quantidadeItem = node.quantidade ?? 0
        for (const ins of insumosArr.slice().sort((a, b) => a.codigo.localeCompare(b.codigo))) {
          expandirInsumo(ins, ins.indice, 1, visitadosRaiz, quantidadeItem)
        }
      }
    }
    return rows
  }

  const planilhaAnaliticaDecomposta = buildPlanilhaAnaliticaDecomposta(arvore)

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

  // ── Consumo total por insumo, com categoria da Planilha Analítica (Materiais/
  // Mão de Obra/Equipamentos/Serviços/Transportes) — usado no modo "Agrupada por
  // tipo de insumo": quantidade aqui já é o total consumido no orçamento inteiro
  // (índice × quantidade do item, propagado recursivamente pelas composições),
  // não o índice por unidade de serviço usado em planilhaAnalitica/Decomposta.
  const insumosConsumo: InsumoConsumoRow[] = []
  for (const ins of todosInsumos) {
    if (compCodesSet.has(ins.codigo)) continue
    const quantidade = consumoMap.get(ins.codigo) ?? 0
    if (quantidade <= 0) continue
    insumosConsumo.push({
      codigo: ins.codigo,
      descricao: ins.descricao,
      unidade: ins.unidade ?? '',
      quantidade,
      custoUnit: ins.custo,
      custoTotal: quantidade * ins.custo,
      categoria: classificarCategoriaAnalitica(ins.grupo),
    })
  }

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
      items: gruposMap.get(label)!.sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR')),
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
    abcGeral,
    planilhaAnalitica,
    planilhaAnaliticaDecomposta,
    insumosConsumo,
    listaInsumos,
    distribuicaoCustos,
  }
}
