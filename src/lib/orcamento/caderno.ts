import type { SupabaseClient } from '@supabase/supabase-js'
import { computeAbcCurves, computeAbcCurvaUnica, type AbcItem, type AbcItemComCategoria, type EstruturaItemBasico, type InsumoComposicaoBasico, type InsumoAvulsoBasico } from '../curva-abc'
import { getInsumosByOrcamentoDetalhado } from './insumos'
import { getComposicoesByOrcamentoDetalhado, type InsumoDeComposicao } from './composicoes'
import { CATEGORIAS_DISTRIBUICAO_CUSTOS, CATEGORIA_OUTROS, CORES_DISTRIBUICAO_CUSTOS, sugerirCategoria } from './categorias-grafico'
import { classificarCategoriaAnalitica, type CategoriaAnalitica } from './analitica-filtros'
import { getPavimentosByOrcamento, type OrcamentoPavimento } from './pavimentos'

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
  /**
   * BDI efetivo (%) — item-folha: bdi_especifico > bdi_global da planilha >
   * bdi_global do orçamento (mesma cadeia de fallbackDoItem/buildNode). Grupo:
   * média ponderada pelos totais dos filhos (totalComBdi/total - 1) × 100 —
   * não é "o" BDI do grupo (filhos podem ter taxas diferentes), é o markup
   * efetivo agregado. Usado na Planilha de Preços Unitários (ver
   * export-caderno-pdf.ts) pra separar Preço de Custo de Preço de Venda.
   */
  bdiPercentual: number
  // classificação Curva ABC (apenas itens-folha; null para grupos)
  classeAbc: AbcClasse | null
  // Planilha à qual o item pertence — presente em grupos também por
  // uniformidade do tipo, mas só tem sentido em itens-folha.
  planilhaId: string | null
  /** Decisão persistida do orçamentista (aba Estimados) — ver getCadernoData(). */
  estimado: boolean
  estimado_motivo: string | null
  /** Override manual do valor em Serviços Estimados (B) — NULL usa `total` calculado. */
  valor_estimado: number | null
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
  /**
   * orcamento_estrutura.id — presente pra todo serviço detectado (marcado na
   * aba Estimados ou com insumo de preço estimado), ausente só pros manuais
   * (orcamento_servicos_estimados, tela Editar Orçamento). Usado pela
   * geração do Caderno pra filtrar quais linhas aparecem na listagem "(B)
   * Serviços Estimados" de um PDF específico (opção "Configurar..." em
   * Relatórios) — nunca persistido, é uma escolha só daquela exportação.
   */
  id?: string
  /**
   * Nome do item/grupo pai imediato na Planilha — mesmo código (`descricao`)
   * pode se repetir em mais de um lugar da árvore (ex.: "Armação Aço -
   * Estimado" dentro de "Fundação" E dentro de "Estrutura"), então o nome
   * sozinho não basta pra saber QUAL ocorrência está em B. Null quando o
   * item está na raiz da planilha (sem pai) ou é uma entrada manual.
   */
  itemPaiDescricao?: string | null
}

/**
 * Um serviço (item da EAP) que usa pelo menos 1 insumo com preço estimado —
 * detalhe completo pro modal "Configurar..." da geração do Caderno (busca,
 * filtro por planilha, contador, escolha de quais aparecem naquele PDF).
 * Não tem estado próprio no banco — a escolha de quais mostrar é sempre
 * feita na hora de gerar o relatório (ver ExportCadernoOptions).
 */
export interface ServicoComInsumoEstimado {
  id: string
  numero: string
  descricao: string
  unidade: string | null
  /** Descrição do grupo/item pai imediato — null quando o item está na raiz da planilha. */
  itemPaiDescricao: string | null
  caminhoCompleto: string[]
  planilhaId: string | null
  planilhaNome: string
  /** Valor do serviço com BDI aplicado — mesma base do Total Orçado (A)/Serviços Estimados (B). */
  valor: number
  qtdInsumosEstimados: number
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
  /** Igual a `arvore`, mas sem remover os itens marcados como estimados — usada
   * só pela Planilha de Preços Unitários do Caderno, que agora lista os estimados
   * junto (destacados), sem afetar o Total Orçado (A), Curva ABC ou Planilha
   * Analítica, que continuam calculados só sobre itens confirmados. */
  arvoreCompleta: CadernoNode[]
  totalGeral: number
  /** Total Orçado (A) com BDI aplicado — o que o cliente vê como preço final. */
  totalGeralComBdi: number
  servicosEstimados: ServicoEstimado[]
  totalServicosEstimados: number
  /** Todo serviço com insumo de preço estimado, mostrado ou não no Caderno — ver ServicoComInsumoEstimado. */
  servicosComInsumoEstimado: ServicoComInsumoEstimado[]
  abcInsumos: AbcItem[]
  abcServicos: AbcItem[]
  abcGeral: AbcItemComCategoria[]
  planilhaAnalitica: PlanilhaAnaliticaRow[]
  planilhaAnaliticaDecomposta: PlanilhaAnaliticaRow[]
  insumosConsumo: InsumoConsumoRow[]
  listaInsumos: ListaInsumoGrupo[]
  distribuicaoCustos: DistribuicaoCustoItem[]
  /** Detalhamento de área por pavimento (Configurações) — vazio quando o orçamento usa só as áreas totais únicas (orcamento.area_total/coberta/equivalente). */
  pavimentos: OrcamentoPavimento[]
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
  /**
   * Decisão explícita do orçamentista (aba Estimados) — nunca inferida do
   * nome. Substituiu o antigo mecanismo de sufixo "- Estimado" no texto, que
   * quebrava silenciosamente sempre que o preço era preenchido depois sem
   * ninguém lembrar de tirar o sufixo do nome.
   */
  estimado: boolean
  estimado_motivo: string | null
  /**
   * Override manual do valor deste item/grupo no total de Serviços Estimados
   * (B) — ver aba Estimados. NULL usa o valor calculado da planilha
   * (sumLeaves), igual ao comportamento antes deste campo existir.
   */
  valor_estimado: number | null
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
  opts?: {
    /**
     * Quando true, `arvore` inclui TAMBÉM os itens marcados como estimados
     * (sem removê-los) — usado pela aba Estimados, que precisa mostrar e
     * calcular o valor de TODOS os itens (marcados ou não) pra montar a
     * lista de seleção. O caderno/relatórios normais nunca passam isso.
     */
    incluirEstimadosNaArvore?: boolean
  },
): Promise<CadernoData> {
  const sb = supabase as any

  let estruturaQuery = sb.from('orcamento_estrutura')
    .select('id, parent_id, planilha_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem, estimado, estimado_motivo, valor_estimado')
    .eq('orcamento_id', orcamentoId)
  if (planilhaIds && planilhaIds.length > 0) estruturaQuery = estruturaQuery.in('planilha_id', planilhaIds)
  estruturaQuery = estruturaQuery
    .order('nivel', { ascending: true })
    .order('ordem', { ascending: true })

  let planilhasQuery = sb.from('orcamento_planilhas').select('id, nome, bdi_global, ordem').eq('orcamento_id', orcamentoId)
  if (planilhaIds && planilhaIds.length > 0) planilhasQuery = planilhasQuery.in('id', planilhaIds)

  const [{ data: orc }, { data: estrutura }, { data: servicosEstimadosRows }, { insumos: todosInsumos, insumosDeComposicao }, { data: planilhasBdi }, pavimentos] = await Promise.all([
    sb.from('tabela_orcamentos')
      .select('nome_obra, codigo, cliente, local, data, bdi_global, area_total, area_coberta, area_equivalente, categorias_grafico')
      .eq('id', orcamentoId)
      .single(),
    estruturaQuery,
    sb.from('orcamento_servicos_estimados')
      .select('descricao, valor')
      .eq('orcamento_id', orcamentoId)
      .order('ordem', { ascending: true }),
    getInsumosByOrcamentoDetalhado(supabase, orcamentoId),
    planilhasQuery,
    getPavimentosByOrcamento(supabase, orcamentoId),
  ])
  // Reaproveita insumosDeComposicao/avulsos já buscados acima em vez de deixar
  // getComposicoesByOrcamentoDetalhado refazer a MESMA paginação de
  // vw_insumos_de_composicao + orcamento_insumos avulsos — medido em produção,
  // dobrava as requisições no Caderno/Relatórios em orçamentos com catálogo grande.
  const avulsosParaComposicoes = todosInsumos.filter(i => i.composicao_id === null).map(i => ({ codigo: i.codigo, custo: i.custo }))
  // composicao_id nunca é null aqui — vem do JOIN em vw_insumos_de_composicao — só o
  // tipo genérico de OrcamentoInsumo não expressa essa garantia.
  const { composicoes } = await getComposicoesByOrcamentoDetalhado(supabase, orcamentoId, {
    avulsos: avulsosParaComposicoes,
    insumosDeComposicao: insumosDeComposicao as unknown as InsumoDeComposicao[],
  })

  const estItems: EstruturaFullItem[] = estrutura ?? []

  // Área efetiva do orçamento: se houver pavimentos cadastrados (Configurações),
  // é a SOMA deles — senão, cai pros campos únicos de tabela_orcamentos (sem
  // pavimentos, comportamento idêntico ao de antes desta funcionalidade
  // existir). Sobrescreve `orc.area_*` aqui, num lugar só, pra qualquer
  // seção do Caderno que já lê `data.orcamento.area_total` etc continuar
  // funcionando sem precisar saber se veio de pavimentos ou não.
  if (orc && pavimentos.length > 0) {
    orc.area_total = pavimentos.reduce((s, p) => s + p.area_total, 0)
    orc.area_equivalente = pavimentos.reduce((s, p) => s + p.area_equivalente, 0)
    orc.area_coberta = pavimentos.reduce((s, p) => s + p.area_coberta, 0)
  }

  // BDI de cada item: bdi_especifico do próprio item > bdi_global DA PLANILHA
  // à qual ele pertence (orcamento_planilhas.bdi_global, que pode divergir do
  // bdi_global do orçamento — mesma fonte usada por persistirTotaisPlanilha()
  // em motor-calculo.ts, para o Caderno bater com o total já calculado pelo
  // sistema) > bdi_global do orçamento como último fallback.
  const planilhaBdiMap = new Map<string, number>(
    ((planilhasBdi ?? []) as { id: string; bdi_global: number | null }[])
      .map(p => [p.id, p.bdi_global ?? 0])
  )
  // nome de cada planilha — usado nos Serviços com Insumo Estimado (coluna
  // Planilha da tela de gerenciamento).
  const planilhaNomeMap = new Map<string, string>(
    ((planilhasBdi ?? []) as { id: string; nome: string }[])
      .map(p => [p.id, p.nome])
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
  const compIdToDescricao = new Map<string, string>()
  const compCodeToId = new Map<string, string>()
  const compCodesSet = new Set<string>()
  for (const c of composicoes) {
    compIdToCode.set(c.id, c.codigo)
    compIdToDescricao.set(c.id, c.descricao)
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

  // ── Itens marcados como estimados (aba Estimados) → Serviços Estimados (B) ──
  // Grupos/itens com `estimado = true` (decisão explícita do orçamentista,
  // persistida em orcamento_estrutura — ver aba Estimados) não compõem o
  // Total Orçado (A) nem as demais seções do caderno; seu custo entra como
  // Serviço Estimado (B), com o custo de toda a sua subárvore. Mesmo destino
  // (sai de A, entra em B) para um item que não está marcado mas usa um
  // insumo de preço estimado — ver infoInsumoEstimado, logo abaixo (esse
  // mecanismo continua automático, não depende da aba Estimados).
  //
  // Substituiu o antigo mecanismo de sufixo "- Estimado" no nome: um texto
  // não tem como saber se o preço já foi preenchido depois, então itens já
  // precificados continuavam presos em B pra sempre a menos que alguém
  // lembrasse de editar o nome. Marcação explícita (checkbox) não tem esse
  // problema — é um fato do item, não uma inferência de texto.

  function sumLeaves(raw: RawNode): number {
    if (raw.filhos.length === 0) return custoUnitarioEfetivo(raw) * (raw.quantidade ?? 0) * fatorBdiDoItem(raw)
    return raw.filhos.reduce((s, f) => s + sumLeaves(f), 0)
  }

  function custoSemBdi(raw: RawNode): number {
    if (raw.filhos.length === 0) return custoUnitarioEfetivo(raw) * (raw.quantidade ?? 0)
    return raw.filhos.reduce((s, f) => s + custoSemBdi(f), 0)
  }

  /**
   * `valor_estimado` (override manual da aba Estimados) é digitado sem BDI —
   * o campo mostra como placeholder node.total, que é sem BDI (ver comentário
   * em estimados-manager.tsx). Pra "(B) Serviços Estimados" ficar na mesma
   * base "com BDI" que "(A) Total Orçado" (e o resto do Caderno), aplica aqui
   * a mesma taxa de BDI que se aplicaria ao total calculado dessa subárvore —
   * sem isso, um item com override aparecia sem BDI no meio de uma lista onde
   * todo o resto tem.
   */
  function valorEstimadoComBdi(raw: RawNode): number | null {
    if (raw.valor_estimado == null) return null
    const semBdi = custoSemBdi(raw)
    if (semBdi <= 0) return raw.valor_estimado
    return raw.valor_estimado * (sumLeaves(raw) / semBdi)
  }

  // Descoberta automática de serviços com preço estimado: um item entra em
  // Serviços Estimados (B) tanto pelo nome terminar em "- Estimado" quanto
  // por usar (via sua composição, ou como insumo avulso direto) algum
  // insumo cuja cotação está marcada como "estimada" (orcamento_insumos.
  // estimado, snapshot de orcamento_insumo_cotacoes.estimado). Nunca há
  // marcação manual no item — a descoberta é 100% derivada dos insumos.
  // composicao_id → descrições dos insumos estimados dessa composição — dá
  // contexto de QUAL composição e QUAL insumo motivaram a marcação (não só
  // "este serviço tem algo estimado", que ficava ambíguo quando o serviço
  // usa uma composição com nome diferente do item da EAP).
  const insumosEstimadosPorComp = new Map<string, string[]>()
  for (const ins of allInsumos) {
    if (!ins.estimado) continue
    const arr = insumosEstimadosPorComp.get(ins.composicao_id) ?? []
    arr.push(ins.descricao)
    insumosEstimadosPorComp.set(ins.composicao_id, arr)
  }
  // codigo → descrição do próprio insumo avulso estimado (item que referencia
  // um insumo diretamente, sem composição intermediária).
  const avulsoEstimadoDescricao = new Map<string, string>()
  for (const ins of todosInsumos) {
    if (ins.composicao_id === null && ins.estimado) avulsoEstimadoDescricao.set(ins.codigo, ins.descricao)
  }
  interface InfoInsumoEstimado { descricao: string; qtd: number }

  /**
   * Se o item usa insumo(s) estimado(s), devolve a descrição "insumo
   * (composição)" — ex.: "Cimento (Parede de exemplo 01)" — pra entrar no
   * Caderno, e a quantidade de insumos estimados envolvidos, pra tela de
   * gerenciamento. Vários insumos estimados na mesma composição entram
   * juntos, separados por vírgula, com a composição uma vez só. Sem
   * composição (insumo avulso direto no item), mostra só o insumo. Sem
   * nenhum insumo estimado associado, devolve null (item só está em B pelo
   * sufixo "- Estimado" no nome, sem insumo específico a apontar — não
   * aparece na tela de gerenciamento, que é só sobre insumo estimado).
   */
  function infoInsumoEstimado(node: RawNode): InfoInsumoEstimado | null {
    if (!node.codigo) return null
    const compId = compCodeToId.get(node.codigo)
    if (compId) {
      const insumosDesc = insumosEstimadosPorComp.get(compId)
      if (!insumosDesc || insumosDesc.length === 0) return null
      const compDescricao = compIdToDescricao.get(compId) ?? node.codigo
      return { descricao: `${insumosDesc.join(', ')} (${compDescricao})`, qtd: insumosDesc.length }
    }
    const avulso = avulsoEstimadoDescricao.get(node.codigo)
    return avulso ? { descricao: avulso, qtd: 1 } : null
  }

  const idsEstimados = new Set<string>()
  const autoServicosEstimados: ServicoEstimado[] = []
  const servicosComInsumoEstimado: ServicoComInsumoEstimado[] = []

  function marcarSubarvore(raw: RawNode) {
    idsEstimados.add(raw.id)
    for (const filho of raw.filhos) marcarSubarvore(filho)
  }

  /**
   * Registra um serviço com insumo estimado no detalhe pro modal
   * "Configurar..." da geração do Caderno (sempre) e na lista que alimenta
   * "(B) Serviços Estimados" (sempre também — a exportação do PDF é quem
   * decide, na hora, quais linhas com `id` ficam visíveis; ver
   * ExportCadernoOptions em export-caderno-pdf.ts). Nada aqui depende de
   * configuração salva no orçamento.
   */
  function registrarServicoComInsumo(raw: RawNode, nomeServico: string, info: InfoInsumoEstimado, caminho: string[], valorOverride?: number | null) {
    const valor = valorOverride ?? sumLeaves(raw)
    servicosComInsumoEstimado.push({
      id: raw.id,
      numero: raw.numero,
      descricao: nomeServico,
      unidade: raw.unidade,
      itemPaiDescricao: caminho.length > 0 ? caminho[caminho.length - 1] : null,
      caminhoCompleto: caminho,
      planilhaId: raw.planilha_id,
      planilhaNome: (raw.planilha_id ? planilhaNomeMap.get(raw.planilha_id) : undefined) ?? 'Planilha',
      valor,
      qtdInsumosEstimados: info.qtd,
    })
    autoServicosEstimados.push({
      id: raw.id, descricao: info.descricao, valor,
      itemPaiDescricao: caminho.length > 0 ? caminho[caminho.length - 1] : null,
    })
  }

  function detectarEstimados(nodes: RawNode[], caminho: string[]) {
    for (const node of nodes) {
      if (node.estimado) {
        marcarSubarvore(node)
        const info = infoInsumoEstimado(node)
        if (info) registrarServicoComInsumo(node, node.descricao, info, caminho, valorEstimadoComBdi(node))
        else autoServicosEstimados.push({
          id: node.id, descricao: node.descricao, valor: valorEstimadoComBdi(node) ?? sumLeaves(node),
          itemPaiDescricao: caminho.length > 0 ? caminho[caminho.length - 1] : null,
        })
        continue
      }
      if (node.tipo === 'item') {
        const info = infoInsumoEstimado(node)
        if (info) {
          marcarSubarvore(node)
          registrarServicoComInsumo(node, node.descricao, info, caminho)
          continue
        }
      }
      detectarEstimados(node.filhos, [...caminho, node.descricao])
    }
  }
  detectarEstimados(roots, [])

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
  const arvoreRoots = opts?.incluirEstimadosNaArvore ? roots : removerEstimados(roots)

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
        bdiPercentual: bdiPct,
        classeAbc: null,
        planilhaId: raw.planilha_id,
        estimado: raw.estimado,
        estimado_motivo: raw.estimado_motivo,
        valor_estimado: raw.valor_estimado,
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
      // Grupo não tem "um" BDI (filhos podem ter taxas diferentes) — markup
      // efetivo agregado, calculado dos totais já somados acima.
      bdiPercentual: total > 0 ? (totalComBdi / total - 1) * 100 : 0,
      classeAbc: null,
      planilhaId: raw.planilha_id,
      estimado: raw.estimado,
      estimado_motivo: raw.estimado_motivo,
      valor_estimado: raw.valor_estimado,
      filhos,
    }
  }

  const arvore = arvoreRoots.map(buildNode)
  const totalGeral = arvore.reduce((s, n) => s + n.total, 0)
  const totalGeralComBdi = arvore.reduce((s, n) => s + n.totalComBdi, 0)
  const arvoreCompleta = roots.map(buildNode)

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
    aplicarClasse(arvoreCompleta)
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
    arvoreCompleta,
    totalGeral,
    totalGeralComBdi,
    servicosEstimados,
    totalServicosEstimados,
    servicosComInsumoEstimado,
    abcInsumos,
    abcServicos,
    abcGeral,
    planilhaAnalitica,
    planilhaAnaliticaDecomposta,
    insumosConsumo,
    listaInsumos,
    distribuicaoCustos,
    pavimentos,
  }
}
