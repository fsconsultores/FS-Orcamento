export function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtQtd(n: number) {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

export function fmtPct(n: number) {
  return n.toFixed(2) + '%'
}

export interface AbcItem {
  codigo: string | null
  descricao: string
  unidade: string | null
  quantidade: number
  custo_unitario: number
  valor_total: number
  percentual: number
  percentual_acumulado: number
  classe: 'A' | 'B' | 'C'
}

function getClasse(acc: number): 'A' | 'B' | 'C' {
  if (acc <= 80) return 'A'
  if (acc <= 95) return 'B'
  return 'C'
}

export function calcularCurvaAbc(
  items: { codigo: string | null; descricao: string; unidade: string | null; quantidade: number; custo_unitario: number }[]
): AbcItem[] {
  const comValor = items
    .map(i => ({ ...i, valor_total: i.quantidade * i.custo_unitario }))
    .filter(i => i.valor_total > 0)

  comValor.sort((a, b) => b.valor_total - a.valor_total)

  const total = comValor.reduce((s, i) => s + i.valor_total, 0)
  if (total === 0) return []

  let acc = 0
  return comValor.map(item => {
    const pct = (item.valor_total / total) * 100
    acc += pct
    return {
      ...item,
      percentual: pct,
      percentual_acumulado: Math.min(acc, 100),
      classe: getClasse(acc),
    }
  })
}

// ─── Split Serviços × Insumos para Curva ABC ─────────────────────────────────

export interface EstruturaItemBasico {
  codigo: string | null
  descricao: string
  unidade: string | null
  quantidade: number | null
  custo_unitario: number | null
}

export interface ComposicaoBasica {
  id: string
  codigo: string
  descricao: string
}

export interface InsumoComposicaoBasico {
  codigo: string
  descricao: string
  unidade: string | null
  custo: number
  indice: number
  composicao_id: string
  grupo: string | null
}

export interface InsumoAvulsoBasico {
  codigo: string
  descricao: string
  custo: number
  grupo?: string | null
}

interface InsumoAccum {
  descricao: string
  unidade: string | null
  custo_unitario: number
  quantidade: number
  grupo: string | null
}

/**
 * Monta o split Serviços × mapa-base de Insumos (antes do ranking ABC), para
 * ser reaproveitado tanto pelo cálculo combinado (computeAbcCurves) quanto
 * pelo cálculo por categoria (computeAbcCurvesPorCategoria).
 */
function buildAbcBase(
  estItems: EstruturaItemBasico[],
  composicoes: ComposicaoBasica[],
  allInsumos: InsumoComposicaoBasico[],
  insumosAvulsos: InsumoAvulsoBasico[],
): { abcServicos: AbcItem[]; insumoMap: Map<string, InsumoAccum> } {
  const compIdToCode = new Map<string, string>()
  const compCodesSet = new Set<string>()
  const compIdToDescricao = new Map<string, string>()
  for (const c of composicoes) {
    compIdToCode.set(c.id, c.codigo)
    compCodesSet.add(c.codigo)
    compIdToDescricao.set(c.id, c.descricao)
  }

  // Split: serviço = item cujo código é uma composição; insumo direto = todo o resto
  const compItems = estItems.filter(item => item.codigo && compCodesSet.has(item.codigo))
  const directInsumoItems = estItems.filter(item => !item.codigo || !compCodesSet.has(item.codigo))

  // ABC de Serviços
  const compMap = new Map<string, { descricao: string; unidade: string | null; quantidade: number; custo_unitario: number }>()
  for (const item of compItems) {
    const key = item.codigo ?? `__nocode__${item.descricao}`
    const qty = item.quantidade ?? 0
    const cu = item.custo_unitario ?? 0
    const existing = compMap.get(key)
    if (existing) {
      existing.quantidade += qty
    } else {
      compMap.set(key, { descricao: item.descricao, unidade: item.unidade, quantidade: qty, custo_unitario: cu })
    }
  }

  const abcServicos = calcularCurvaAbc(
    Array.from(compMap.entries()).map(([k, d]) => ({
      codigo: k.startsWith('__nocode__') ? null : k,
      descricao: d.descricao,
      unidade: d.unidade,
      quantidade: d.quantidade,
      custo_unitario: d.custo_unitario,
    }))
  )

  // ABC de Insumos
  const compQtyByCode = new Map<string, number>()
  for (const item of compItems) {
    if (item.codigo) {
      compQtyByCode.set(item.codigo, (compQtyByCode.get(item.codigo) ?? 0) + (item.quantidade ?? 0))
    }
  }

  // Propaga quantidades por composições aninhadas: quando uma composição usada
  // na planilha (qtyComp > 0) tem, entre seus sub-itens, o código de OUTRA
  // composição (sub-composição), a quantidade efetiva desta também deve
  // considerar essa demanda (qtyComp_pai × índice), e assim recursivamente.
  const compChildren = new Map<string, { childCodigo: string; indice: number }[]>()
  for (const ins of allInsumos) {
    if (!ins.composicao_id || !compCodesSet.has(ins.codigo)) continue
    const parentCodigo = compIdToCode.get(ins.composicao_id)
    if (!parentCodigo) continue
    const children = compChildren.get(parentCodigo) ?? []
    children.push({ childCodigo: ins.codigo, indice: ins.indice })
    compChildren.set(parentCodigo, children)
  }
  const propagacaoQueue: [string, number][] = []
  for (const [codigo, qty] of compQtyByCode.entries()) {
    if (qty > 0) propagacaoQueue.push([codigo, qty])
  }
  let propagacaoIter = 0
  while (propagacaoQueue.length > 0 && propagacaoIter < 100000) {
    propagacaoIter++
    const [codigo, qty] = propagacaoQueue.shift()!
    for (const { childCodigo, indice } of compChildren.get(codigo) ?? []) {
      if (childCodigo === codigo) continue
      const addQty = qty * indice
      if (addQty === 0) continue
      compQtyByCode.set(childCodigo, (compQtyByCode.get(childCodigo) ?? 0) + addQty)
      propagacaoQueue.push([childCodigo, addQty])
    }
  }

  // Fallback: quando o código da composição não corresponde a nenhum item da
  // planilha (qtyComp === 0), procura um item direto cuja descrição coincida
  // (ou seja prefixo) com a descrição da composição — caso de itens cujo
  // código foi reatribuído na planilha mas a composição manteve o código original.
  const normDesc = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim()
  for (const c of composicoes) {
    if ((compQtyByCode.get(c.codigo) ?? 0) !== 0) continue
    const compDescNorm = normDesc(c.descricao)
    if (!compDescNorm) continue
    const matches = directInsumoItems.filter(item => {
      const itemDescNorm = normDesc(item.descricao)
      return itemDescNorm.length > 0 && (itemDescNorm.startsWith(compDescNorm) || compDescNorm.startsWith(itemDescNorm))
    })
    if (matches.length === 1) {
      const m = matches[0]
      compQtyByCode.set(c.codigo, m.quantidade ?? 0)
      compMap.set(c.codigo, { descricao: m.descricao, unidade: m.unidade, quantidade: m.quantidade ?? 0, custo_unitario: m.custo_unitario ?? 0 })
    }
  }

  // Custo efetivo por código: o orçamento mantém uma "tabela de preços" nos
  // insumos avulsos (composicao_id null); quando existe um avulso para o código,
  // seu custo prevalece sobre o custo (possivelmente zerado) gravado na linha do
  // sub-insumo da composição — mesmo critério usado em getComposicoesByOrcamento.
  const precoMap = new Map<string, number>()
  const grupoAvulsoPorCodigo = new Map<string, string | null>()
  for (const av of insumosAvulsos) {
    precoMap.set(av.codigo, av.custo)
    grupoAvulsoPorCodigo.set(av.codigo, av.grupo ?? null)
  }

  const insumoMap = new Map<string, InsumoAccum>()

  for (const ins of allInsumos) {
    // Exclui sub-composições (código de composição), para evitar dupla contagem
    if (compCodesSet.has(ins.codigo)) continue

    const compCodigo = compIdToCode.get(ins.composicao_id)
    if (!compCodigo) continue
    const qtyComp = compQtyByCode.get(compCodigo) ?? 0
    if (qtyComp === 0) continue

    // Quando a descrição do sub-insumo é apenas uma cópia do rótulo (curto/
    // desatualizado) da própria composição, usamos a descrição do item da
    // planilha (mais completa/atual) no lugar.
    const descricaoEhCopiaDaComposicao = ins.descricao === compIdToDescricao.get(ins.composicao_id)
    const descricao = descricaoEhCopiaDaComposicao ? (compMap.get(compCodigo)?.descricao ?? ins.descricao) : ins.descricao

    const custoEfetivo = precoMap.has(ins.codigo) ? precoMap.get(ins.codigo)! : ins.custo

    const qtdUsada = ins.indice * qtyComp
    const existing = insumoMap.get(ins.codigo)
    if (existing) {
      existing.quantidade += qtdUsada
    } else {
      insumoMap.set(ins.codigo, {
        descricao,
        unidade: ins.unidade,
        custo_unitario: custoEfetivo,
        quantidade: qtdUsada,
        grupo: ins.grupo ?? grupoAvulsoPorCodigo.get(ins.codigo) ?? null,
      })
    }
  }

  // Itens diretos da planilha cujo código não é "I" (ex: CZxxxx) podem ter um
  // insumo avulso "I...." correspondente (mesma descrição) — usamos o código
  // dele para que o item seja reconhecido como insumo real.
  const avulsoCodigoByDescricao = new Map<string, string>()
  for (const av of insumosAvulsos) {
    if (av.codigo.toUpperCase().startsWith('I')) avulsoCodigoByDescricao.set(av.descricao, av.codigo)
  }

  // Insumos diretos da planilha (itens sem composição com sub-insumos)
  for (const item of directInsumoItems) {
    let key = item.codigo ?? `__nocode__${item.descricao}`
    if (!item.codigo || !item.codigo.toUpperCase().startsWith('I')) {
      const avulsoCodigo = avulsoCodigoByDescricao.get(item.descricao)
      if (avulsoCodigo) key = avulsoCodigo
    }
    const qty = item.quantidade ?? 0
    const custo = item.custo_unitario ?? 0
    const existing = insumoMap.get(key)
    if (existing) {
      existing.quantidade += qty
    } else {
      insumoMap.set(key, {
        descricao: item.descricao,
        unidade: item.unidade,
        custo_unitario: custo,
        quantidade: qty,
        grupo: grupoAvulsoPorCodigo.get(key) ?? null,
      })
    }
  }

  return { abcServicos, insumoMap }
}

/**
 * Divide os itens da planilha em "Serviços" (itens cujo código é uma composição
 * com sub-insumos cadastrados) e "Insumos" (itens diretos + sub-insumos das
 * composições, ponderados pela quantidade usada na planilha) e calcula a Curva
 * ABC de cada conjunto.
 */
export function computeAbcCurves(
  estItems: EstruturaItemBasico[],
  composicoes: ComposicaoBasica[],
  allInsumos: InsumoComposicaoBasico[],
  insumosAvulsos: InsumoAvulsoBasico[] = [],
): { abcServicos: AbcItem[]; abcInsumos: AbcItem[] } {
  const { abcServicos, insumoMap } = buildAbcBase(estItems, composicoes, allInsumos, insumosAvulsos)

  // Curva ABC de Insumos considera apenas códigos reais de insumos (prefixo "I")
  const abcInsumos = calcularCurvaAbc(
    Array.from(insumoMap.entries())
      .filter(([k]) => k.toUpperCase().startsWith('I'))
      .map(([k, d]) => ({
        codigo: k,
        descricao: d.descricao,
        unidade: d.unidade,
        quantidade: d.quantidade,
        custo_unitario: d.custo_unitario,
      }))
  )

  return { abcServicos, abcInsumos }
}

// ─── Curva ABC única, com categoria por item (Materiais / Mão de Obra / Equipamentos / Serviços) ──

export type CategoriaAbc = 'materiais' | 'mao_de_obra' | 'equipamentos' | 'servicos'

/**
 * Classifica um insumo (pelo campo `grupo`) em uma das 4 categorias da Curva
 * ABC. Mesma lógica de classificarLabel em caderno.ts (E→Equipamento,
 * H/HH/MO*→Mão de Obra, S/SER*→Serviço de terceiros, senão→Material), só que
 * retornando um enum em vez de rótulo de exibição. Mantida separada de
 * classificarGrupo (caderno.ts) porque aquela função serve o breakdown
 * MAT/MO/TERCEIROS do Caderno (3 categorias) e não deve mudar.
 */
export function classificarCategoriaAbc(grupo: string | null | undefined): CategoriaAbc {
  const g = (grupo ?? '').trim().toUpperCase()
  if (g === 'E') return 'equipamentos'
  if (g === 'H' || g === 'HH' || g.startsWith('MO')) return 'mao_de_obra'
  if (g === 'S' || g.startsWith('SER')) return 'servicos'
  return 'materiais'
}

export interface AbcItemComCategoria extends AbcItem {
  categoria: CategoriaAbc
}

/**
 * Curva ABC única do orçamento: decompõe TODO o projeto até o nível de
 * insumo/serviço-de-terceiros (via buildAbcBase.insumoMap — que já propaga
 * quantidades por composições aninhadas) e classifica cada entrada em uma das
 * 4 categorias. Importante: NÃO soma abcServicos (o total agregado por
 * composição) por cima disso — abcServicos é a MESMA quantia decomposta aqui,
 * só que vista por linha de serviço da planilha; somar as duas contaria o
 * mesmo custo em dobro. O total desta curva já reflete o custo real do
 * projeto (dentro da mesma margem de itens sem insumo cadastrado que o
 * restante do sistema já aceita, ex. em "Lista de Insumos" do Caderno).
 */
export function computeAbcCurvaUnica(
  estItems: EstruturaItemBasico[],
  composicoes: ComposicaoBasica[],
  allInsumos: InsumoComposicaoBasico[],
  insumosAvulsos: InsumoAvulsoBasico[] = [],
): AbcItemComCategoria[] {
  const { insumoMap } = buildAbcBase(estItems, composicoes, allInsumos, insumosAvulsos)

  const entries = Array.from(insumoMap.entries())
  const categoriaPorCodigo = new Map<string, CategoriaAbc>()
  for (const [k, d] of entries) categoriaPorCodigo.set(k, classificarCategoriaAbc(d.grupo))

  const geral = calcularCurvaAbc(
    entries.map(([k, d]) => ({ codigo: k, descricao: d.descricao, unidade: d.unidade, quantidade: d.quantidade, custo_unitario: d.custo_unitario }))
  )

  return geral.map(item => ({
    ...item,
    categoria: item.codigo ? (categoriaPorCodigo.get(item.codigo) ?? 'materiais') : 'materiais',
  }))
}
