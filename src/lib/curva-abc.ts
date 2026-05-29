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
