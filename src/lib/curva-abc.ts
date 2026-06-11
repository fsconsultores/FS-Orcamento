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
): { abcServicos: AbcItem[]; abcInsumos: AbcItem[] } {
  const compIdToCode = new Map<string, string>()
  const compCodesSet = new Set<string>()
  for (const c of composicoes) {
    compIdToCode.set(c.id, c.codigo)
    compCodesSet.add(c.codigo)
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

  type InsumoAccum = { descricao: string; unidade: string | null; custo_unitario: number; quantidade: number }
  const insumoMap = new Map<string, InsumoAccum>()

  for (const ins of allInsumos) {
    // Exclui sub-composições (código de composição) e grupos de serviço (S, SER…)
    if (compCodesSet.has(ins.codigo)) continue
    const g = (ins.grupo ?? '').trim().toUpperCase()
    if (g && (g === 'S' || g.startsWith('SER') || g.startsWith('SERVIC'))) continue

    const compCodigo = compIdToCode.get(ins.composicao_id)
    if (!compCodigo) continue
    const qtyComp = compQtyByCode.get(compCodigo) ?? 0
    if (qtyComp === 0) continue

    const qtdUsada = ins.indice * qtyComp
    const existing = insumoMap.get(ins.codigo)
    if (existing) {
      existing.quantidade += qtdUsada
    } else {
      insumoMap.set(ins.codigo, {
        descricao: ins.descricao,
        unidade: ins.unidade,
        custo_unitario: ins.custo,
        quantidade: qtdUsada,
      })
    }
  }

  // Insumos diretos da planilha (itens sem composição com sub-insumos)
  for (const item of directInsumoItems) {
    const key = item.codigo ?? `__nocode__${item.descricao}`
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
      })
    }
  }

  const abcInsumos = calcularCurvaAbc(
    Array.from(insumoMap.entries()).map(([k, d]) => ({
      codigo: k.startsWith('__nocode__') ? null : k,
      descricao: d.descricao,
      unidade: d.unidade,
      quantidade: d.quantidade,
      custo_unitario: d.custo_unitario,
    }))
  )

  return { abcServicos, abcInsumos }
}
