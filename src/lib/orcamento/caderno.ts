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
  // custos unitários (apenas itens-folha) — custo puro, sem BDI. Usado pela
  // Planilha Analítica/Decomposta e Curva ABC, que continuam em custo puro.
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
  // Equivalentes COM BDI aplicado (bdi_especifico do item, com fallback para
  // o bdi_global do orçamento) — usados só na Planilha de Preços Unitários,
  // no Resumo Geral e na Distribuição de Custos, que são o que o cliente
  // efetivamente paga. Ver getCadernoData().
  custoMatComBdi: number
  custoMoComBdi: number
  custoTerceirosComBdi: number
  custoUnitarioComBdi: number
  totalComBdi: number
  percentualComBdi: number
  // classificação Curva ABC (apenas itens-folha; null para grupos)
  classeAbc: AbcClasse | null
  // Planilha à qual o item pertence — presente em grupos também por
  // uniformidade do tipo, mas só tem sentido em itens-folha.
  planilhaId: string | null
  filhos: CadernoNode[]
}

export type PlanilhaAnaliticaRow =
  | { tipo: 'grupo'; numero: string; descricao: string }
  | { tipo: 'item'; numero: string; codigo: string; descricao: string; unidade: string; quantidade: number; custoUnitario: number; custoTotal: number; classeAbc: AbcClasse | null }
  | {
      tipo: 'insumo'; codigo: string; descricao: string; unidade: string; indice: number; custoUnit: number; custoTotal: number; nivel: number; categoria: CategoriaAnalitica; quantidadeTotalItem: number
      // Preço estimado (ver seção Serviços com Preços Estimados) — snapshot da
      // cotação deste insumo específico dentro da composição (nunca uma
      // marcação manual). Opcional pelo mesmo motivo de fornecedor/
      // dataCotacao/observacoes: no
      // modo Agrupada um mesmo código pode vir de composições diferentes com
      // flags "estimado" divergentes, então não há um valor único — fica
      // undefined lá (tratado como não-estimado no destaque do PDF).
      estimado?: boolean
      // Opcionais: só populados nos modos Normal/Decomposta (vêm do avulso via
      // insumoInfoMap); o modo Agrupada soma consumo do orçamento inteiro, onde
      // "uma" data/fornecedor por código não faz sentido — fica null lá.
      fornecedor?: string | null; dataCotacao?: string | null; observacoes?: string | null
    }

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
  /** Total Orçado (A) com BDI aplicado — o que o cliente vê como preço final. */
  totalGeralComBdi: number
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
    .select('id, parent_id, planilha_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem')
    .eq('orcamento_id', orcamentoId)
  if (planilhaIds && planilhaIds.length > 0) estruturaQuery = estruturaQuery.in('planilha_id', planilhaIds)
  estruturaQuery = estruturaQuery
    .order('nivel', { ascending: true })
    .order('ordem', { ascending: true })

  let planilhasQuery = sb.from('orcamento_planilhas').select('id, nome, bdi_global, ordem').eq('orcamento_id', orcamentoId)
  if (planilhaIds && planilhaIds.length > 0) planilhasQuery = planilhasQuery.in('id', planilhaIds)

  const [{ data: orc }, { data: estrutura }, { data: servicosEstimadosRows }, composicoes, { insumos: todosInsumos, insumosDeComposicao }, { data: planilhasBdi }] = await Promise.all([
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
    planilhasQuery,
  ])

  const estItems: EstruturaFullItem[] = estrutura ?? []

  // BDI de cada item: bdi_especifico do próprio item > bdi_global DA PLANILHA
  // à qual ele pertence (orcamento_planilhas.bdi_global, que pode divergir do
  // bdi_global do orçamento — mesma fonte usada por persistirTotaisPlanilha()
  // em motor-calculo.ts, para o Caderno bater com o total já calculado pelo
  // sistema) > bdi_global do orçamento como último fallback.
  const planilhaBdiMap = new Map<string, number>(
    ((planilhasBdi ?? []) as { id: string; bdi_global: number | null }[])
      .map(p => [p.id, p.bdi_global ?? 0])
  )
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
    estimado: ins.estimado ?? false,
    estimadoMotivo: ins.estimado_motivo ?? null,
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

  // codigo → { custo, grupo, cotação } a partir da lista deduplicada de
  // insumos (avulso tem prioridade — é onde a cotação é registrada; cópias
  // embutidas em composição não têm cotação própria). Reaproveitado pela
  // Planilha Analítica pra exibir fornecedor/data/observações sem consulta
  // nova — `todosInsumos` já é o mesmo fetch usado por tudo mais aqui.
  const insumoInfoMap = new Map<string, { custo: number; grupo: string | null; fornecedor: string | null; dataCotacao: string | null; observacoes: string | null }>()
  for (const ins of todosInsumos) {
    insumoInfoMap.set(ins.codigo, {
      custo: ins.custo, grupo: ins.grupo,
      fornecedor: ins.fornecedor ?? null,
      dataCotacao: ins.data_cotacao ?? null,
      observacoes: ins.cotacao_observacoes ?? null,
    })
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

  // Fator de BDI de um item-folha: bdi_especifico > bdi_global da planilha à
  // qual pertence > bdi_global do orçamento. Mesma cadeia de fallback usada em
  // buildNode() — compartilhada aqui para os Serviços Estimados (B) também
  // saírem com BDI, batendo com o Total Orçado (A).
  function fatorBdiDoItem(raw: EstruturaFullItem): number {
    const bdiPct = raw.bdi_especifico
      ?? (raw.planilha_id ? planilhaBdiMap.get(raw.planilha_id) : undefined)
      ?? orc?.bdi_global
      ?? 0
    return 1 + bdiPct / 100
  }

  // ── Itens "- Estimado" → Serviços Estimados (B) ──────────────────────────────
  // Grupos/itens cujo nome termina em "- Estimado" não compõem o Total Orçado
  // (A) nem as demais seções do caderno; seu custo entra como Serviço
  // Estimado (B). Quando o marcador está num grupo, cada filho direto vira
  // um serviço estimado (com o custo de toda a sua subárvore). Mesmo destino
  // (sai de A, entra em B) para um item que não tem esse sufixo mas usa um
  // insumo de preço estimado — ver temInsumoEstimado, logo abaixo.
  const ESTIMADO_RE = /\s*-\s*estimados?\s*$/i

  function sumLeaves(raw: RawNode): number {
    if (raw.filhos.length === 0) return custoUnitarioEfetivo(raw) * (raw.quantidade ?? 0) * fatorBdiDoItem(raw)
    return raw.filhos.reduce((s, f) => s + sumLeaves(f), 0)
  }

  // Descoberta automática de serviços com preço estimado: um item entra em
  // Serviços Estimados (B) tanto pelo nome terminar em "- Estimado" quanto
  // por usar (via sua composição, ou como insumo avulso direto) algum
  // insumo cuja cotação está marcada como "estimada" (orcamento_insumos.
  // estimado, snapshot de orcamento_insumo_cotacoes.estimado). Nunca há
  // marcação manual no item — a descoberta é 100% derivada dos insumos.
  const compIdsComInsumoEstimado = new Set<string>()
  for (const ins of allInsumos) {
    if (ins.estimado) compIdsComInsumoEstimado.add(ins.composicao_id)
  }
  const codigosAvulsoEstimados = new Set<string>()
  for (const ins of todosInsumos) {
    if (ins.composicao_id === null && ins.estimado) codigosAvulsoEstimados.add(ins.codigo)
  }
  function temInsumoEstimado(node: RawNode): boolean {
    if (!node.codigo) return false
    const compId = compCodeToId.get(node.codigo)
    if (compId) return compIdsComInsumoEstimado.has(compId)
    return codigosAvulsoEstimados.has(node.codigo)
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
      if (node.tipo === 'item' && temInsumoEstimado(node)) {
        marcarSubarvore(node)
        autoServicosEstimados.push({ descricao: node.descricao, valor: sumLeaves(node) })
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
      const bdiPct = raw.bdi_especifico
        ?? (raw.planilha_id ? planilhaBdiMap.get(raw.planilha_id) : undefined)
        ?? orc?.bdi_global
        ?? 0
      const fatorBdi = 1 + bdiPct / 100
      return {
        id: raw.id, numero: raw.numero, nivel: raw.nivel, codigo: raw.codigo,
        descricao: raw.descricao, unidade: raw.unidade, quantidade: raw.quantidade, tipo: raw.tipo,
        custoMat, custoMo, custoTerceiros, custoUnitario,
        totalMat: custoMat * quantidade, totalMo: custoMo * quantidade, totalTerceiros: custoTerceiros * quantidade, total,
        percentual: 0,
        custoMatComBdi: custoMat * fatorBdi,
        custoMoComBdi: custoMo * fatorBdi,
        custoTerceirosComBdi: custoTerceiros * fatorBdi,
        custoUnitarioComBdi: custoUnitario * fatorBdi,
        totalComBdi: total * fatorBdi,
        percentualComBdi: 0,
        classeAbc: null,
        planilhaId: raw.planilha_id,
        filhos: [],
      }
    }

    const filhos = raw.filhos.map(buildNode)
    const totalMat = filhos.reduce((s, f) => s + f.totalMat, 0)
    const totalMo = filhos.reduce((s, f) => s + f.totalMo, 0)
    const totalTerceiros = filhos.reduce((s, f) => s + f.totalTerceiros, 0)
    const total = filhos.reduce((s, f) => s + f.total, 0)
    const totalComBdi = filhos.reduce((s, f) => s + f.totalComBdi, 0)
    return {
      id: raw.id, numero: raw.numero, nivel: raw.nivel, codigo: raw.codigo,
      descricao: raw.descricao, unidade: raw.unidade, quantidade: raw.quantidade, tipo: raw.tipo,
      custoMat: 0, custoMo: 0, custoTerceiros: 0, custoUnitario: 0,
      totalMat, totalMo, totalTerceiros, total,
      percentual: 0,
      custoMatComBdi: 0, custoMoComBdi: 0, custoTerceirosComBdi: 0, custoUnitarioComBdi: 0,
      totalComBdi,
      percentualComBdi: 0,
      classeAbc: null,
      planilhaId: raw.planilha_id,
      filhos,
    }
  }

  const arvore = arvoreRoots.map(buildNode)
  const totalGeral = arvore.reduce((s, n) => s + n.total, 0)
  const totalGeralComBdi = arvore.reduce((s, n) => s + n.totalComBdi, 0)

  function aplicarPercentual(nodes: CadernoNode[]) {
    for (const n of nodes) {
      n.percentual = totalGeral > 0 ? (n.total / totalGeral) * 100 : 0
      n.percentualComBdi = totalGeralComBdi > 0 ? (n.totalComBdi / totalGeralComBdi) * 100 : 0
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
    // Com BDI — é o gráfico mostrado junto ao Resumo Geral/Total Orçado (A),
    // que já reflete o preço com BDI; precisa bater com o total ali ao lado.
    if (n.totalComBdi <= 0) continue
    const categoria = categoriasMap[n.numero] || sugerirCategoria(n.descricao)
    totalPorCategoria.set(categoria, (totalPorCategoria.get(categoria) ?? 0) + n.totalComBdi)
  }
  const distribuicaoCustos: DistribuicaoCustoItem[] = []
  CATEGORIAS_DISTRIBUICAO_CUSTOS.forEach((categoria, i) => {
    const value = totalPorCategoria.get(categoria) ?? 0
    if (value <= 0) return
    distribuicaoCustos.push({
      numero: String(i + 1).padStart(2, '0'),
      label: categoria,
      value,
      percentual: totalGeralComBdi > 0 ? (value / totalGeralComBdi) * 100 : 0,
      color: CORES_DISTRIBUICAO_CUSTOS[categoria],
    })
  })
  const totalOutros = totalPorCategoria.get(CATEGORIA_OUTROS) ?? 0
  if (totalOutros > 0) {
    distribuicaoCustos.push({
      numero: '',
      label: CATEGORIA_OUTROS,
      value: totalOutros,
      percentual: totalGeralComBdi > 0 ? (totalOutros / totalGeralComBdi) * 100 : 0,
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
          const infoIns = insumoInfoMap.get(ins.codigo)
          rows.push({
            tipo: 'insumo',
            codigo: ins.codigo,
            descricao: ins.descricao,
            unidade: ins.unidade ?? '',
            indice: ins.indice,
            custoUnit,
            custoTotal: custoUnit * ins.indice,
            nivel: 1,
            categoria: classificarCategoriaAnalitica(infoIns?.grupo),
            quantidadeTotalItem: ins.indice * quantidadeItem,
            estimado: ins.estimado ?? false,
            fornecedor: infoIns?.fornecedor ?? null,
            dataCotacao: infoIns?.dataCotacao ?? null,
            observacoes: infoIns?.observacoes ?? null,
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
      const infoIns = insumoInfoMap.get(ins.codigo)
      rows.push({
        tipo: 'insumo',
        codigo: ins.codigo,
        descricao: ins.descricao,
        unidade: ins.unidade ?? '',
        indice: indiceAcumulado,
        custoUnit,
        custoTotal: custoUnit * indiceAcumulado,
        nivel,
        categoria: classificarCategoriaAnalitica(infoIns?.grupo),
        quantidadeTotalItem: indiceAcumulado * quantidadeItem,
        estimado: ins.estimado ?? false,
        fornecedor: infoIns?.fornecedor ?? null,
        dataCotacao: infoIns?.dataCotacao ?? null,
        observacoes: infoIns?.observacoes ?? null,
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
  // `acumularConsumo` recebe o mapa de destino porque precisamos de DOIS
  // escopos: `consumoMap` (só o Total Orçado A — usado pela Curva/Analítica
  // Agrupada, que só faz sentido para o que efetivamente compõe o preço
  // fechado) e `consumoMapCompleto` (A+B — usado pela Lista de Insumos, que é
  // a lista de material de TODA a obra, inclusive itens "- Estimado" que
  // saem do Total A e viram Serviço Estimado B, mas ainda consomem insumo).
  function acumularConsumo(map: Map<string, number>, codigo: string, qtd: number, visitados: Set<string>) {
    if (compCodesSet.has(codigo)) {
      if (visitados.has(codigo)) return
      const compId = compCodeToId.get(codigo)
      const insumosArr = compId ? compInsumosByCompId.get(compId) : undefined
      if (!insumosArr) return
      const proximosVisitados = new Set(visitados).add(codigo)
      for (const ins of insumosArr) acumularConsumo(map, ins.codigo, qtd * ins.indice, proximosVisitados)
    } else {
      map.set(codigo, (map.get(codigo) ?? 0) + qtd)
    }
  }

  const consumoMap = new Map<string, number>()
  function percorrerItens(nodes: CadernoNode[]) {
    for (const n of nodes) {
      if (n.tipo === 'item' && n.codigo) acumularConsumo(consumoMap, n.codigo, n.quantidade ?? 0, new Set())
      percorrerItens(n.filhos)
    }
  }
  percorrerItens(arvore)

  const consumoMapCompleto = new Map<string, number>()
  function percorrerItensCompleto(nodes: RawNode[]) {
    for (const n of nodes) {
      if (n.tipo === 'item' && n.codigo) acumularConsumo(consumoMapCompleto, n.codigo, n.quantidade ?? 0, new Set())
      percorrerItensCompleto(n.filhos)
    }
  }
  percorrerItensCompleto(roots)

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
  // Usa consumoMapCompleto (A+B) — ver comentário acima de acumularConsumo.
  const gruposMap = new Map<string, ListaInsumoItem[]>()
  for (const ins of todosInsumos) {
    if (compCodesSet.has(ins.codigo)) continue
    const label = classificarLabel(ins.grupo)
    const quantidade = consumoMapCompleto.get(ins.codigo) ?? 0
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
    totalGeralComBdi,
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
