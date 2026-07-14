import type { PlanilhaAnaliticaRow, AbcClasse, InsumoConsumoRow } from './caderno'

export type CategoriaAnalitica = 'materiais' | 'mao_de_obra' | 'equipamentos' | 'servicos' | 'transportes'

export const CATEGORIA_ANALITICA_LABELS: Record<CategoriaAnalitica, string> = {
  materiais: 'Materiais',
  mao_de_obra: 'Mão de Obra',
  equipamentos: 'Equipamentos',
  servicos: 'Serviços',
  transportes: 'Transportes',
}

export const CATEGORIA_ANALITICA_ORDEM: CategoriaAnalitica[] = [
  'materiais', 'mao_de_obra', 'equipamentos', 'servicos', 'transportes',
]

/**
 * Classificador usado só na Planilha Analítica (filtro "Somente Materiais/MO/
 * Equipamentos/Serviços/Transportes"). Separado de classificarCategoriaAbc
 * (curva-abc.ts), que não trata 'T' como categoria própria e não deve mudar —
 * é o classificador oficial das 4 categorias da Curva ABC.
 */
export function classificarCategoriaAnalitica(grupo: string | null | undefined): CategoriaAnalitica {
  const g = (grupo ?? '').trim().toUpperCase()
  if (g === 'E') return 'equipamentos'
  if (g === 'H' || g === 'HH' || g.startsWith('MO')) return 'mao_de_obra'
  if (g === 'S' || g.startsWith('SER')) return 'servicos'
  if (g === 'T') return 'transportes'
  return 'materiais'
}

export interface AnaliticaFilterOptions {
  /** undefined ou vazio = sem filtro (mostra todas as categorias) */
  categorias?: Set<CategoriaAnalitica>
  /** undefined ou vazio = sem filtro (mostra todas as classes) */
  classesAbc?: Set<AbcClasse>
}

/** undefined ou vazio = sem filtro (mostra todas as categorias) */
export function filterInsumosConsumo(rows: InsumoConsumoRow[], categorias?: Set<CategoriaAnalitica>): InsumoConsumoRow[] {
  if (!categorias || categorias.size === 0) return rows
  return rows.filter(r => categorias.has(r.categoria))
}

/**
 * Filtra linhas da Planilha Analítica (Normal ou Decomposta) por classe ABC
 * do item e/ou categoria do insumo. Um item cuja classeAbc não passa no
 * filtro é removido junto com todas as suas linhas de insumo (que sempre
 * vêm logo depois dele no array). Grupos que ficam sem nenhum item/insumo
 * remanescente em toda a sua subárvore são removidos.
 */
export function filterAnaliticaRows(rows: PlanilhaAnaliticaRow[], opts: AnaliticaFilterOptions): PlanilhaAnaliticaRow[] {
  const categorias = opts.categorias && opts.categorias.size > 0 ? opts.categorias : null
  const classes = opts.classesAbc && opts.classesAbc.size > 0 ? opts.classesAbc : null

  const kept: PlanilhaAnaliticaRow[] = []
  let lastItemKept = true

  for (const row of rows) {
    if (row.tipo === 'grupo') {
      kept.push(row)
      continue
    }
    if (row.tipo === 'item') {
      lastItemKept = !classes || (row.classeAbc != null && classes.has(row.classeAbc))
      if (lastItemKept) kept.push(row)
      continue
    }
    if (!lastItemKept) continue
    if (categorias && !categorias.has(row.categoria)) continue
    kept.push(row)
  }

  return removeEmptyGroups(kept)
}

function removeEmptyGroups(rows: PlanilhaAnaliticaRow[]): PlanilhaAnaliticaRow[] {
  const stack: { idx: number; numero: string }[] = []
  const hasContent = new Map<number, boolean>()

  function closeUntilAncestorOf(numero: string) {
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      if (numero === top.numero || numero.startsWith(top.numero + '.')) break
      stack.pop()
    }
  }

  rows.forEach((row, idx) => {
    if (row.tipo === 'grupo') {
      closeUntilAncestorOf(row.numero)
      hasContent.set(idx, false)
      stack.push({ idx, numero: row.numero })
    } else {
      for (const g of stack) hasContent.set(g.idx, true)
    }
  })

  return rows.filter((row, idx) => row.tipo !== 'grupo' || hasContent.get(idx))
}

/**
 * Modo "Agrupada por tipo de insumo": ignora a hierarquia da planilha e lista,
 * sob um cabeçalho por categoria, o CONSUMO TOTAL de cada insumo no orçamento
 * inteiro — não o índice por unidade de serviço usado nos modos Normal/
 * Decomposta. Ex.: um insumo "IH..." que aparece em 3 composições diferentes
 * mostra aqui a soma de (índice × quantidade do item da planilha) das 3,
 * propagada recursivamente por sub-composições — é o mesmo `quantidade` já
 * calculado para a Lista de Insumos do Caderno (`consumoMap`/`insumosConsumo`
 * em caderno.ts), só que categorizado com classificarCategoriaAnalitica (que,
 * ao contrário de classificarLabel, distingue Transportes).
 */
export function buildAgrupadaRows(insumosConsumo: InsumoConsumoRow[], categorias?: Set<CategoriaAnalitica>): PlanilhaAnaliticaRow[] {
  const filtrados = filterInsumosConsumo(insumosConsumo, categorias)

  const byCategoria = new Map<CategoriaAnalitica, InsumoConsumoRow[]>()
  for (const r of filtrados) {
    const arr = byCategoria.get(r.categoria) ?? []
    arr.push(r)
    byCategoria.set(r.categoria, arr)
  }

  const out: PlanilhaAnaliticaRow[] = []
  for (const cat of CATEGORIA_ANALITICA_ORDEM) {
    const items = byCategoria.get(cat)
    if (!items || items.length === 0) continue
    out.push({ tipo: 'grupo', numero: '', descricao: CATEGORIA_ANALITICA_LABELS[cat] })
    for (const r of items.slice().sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR'))) {
      out.push({
        tipo: 'insumo', codigo: r.codigo, descricao: r.descricao, unidade: r.unidade,
        indice: r.quantidade, custoUnit: r.custoUnit, custoTotal: r.custoTotal,
        nivel: 0, categoria: cat, quantidadeTotalItem: r.quantidade,
      })
    }
  }
  return out
}
