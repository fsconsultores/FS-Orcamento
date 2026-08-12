import type { EstruturaItem } from './planilha-crud-action'

export interface Nodo extends EstruturaItem {
  filhos: Nodo[]
  total: number
  totalComBdi: number
}

export function buildTree(items: EstruturaItem[]): Nodo[] {
  const map = new Map<string, Nodo>()
  for (const item of items) map.set(item.id, { ...item, filhos: [], total: 0, totalComBdi: 0 })
  const roots: Nodo[] = []
  for (const nodo of map.values()) {
    if (nodo.parent_id && map.has(nodo.parent_id)) map.get(nodo.parent_id)!.filhos.push(nodo)
    else roots.push(nodo)
  }
  function sort(nodes: Nodo[]) {
    nodes.sort((a, b) => a.ordem - b.ordem)
    for (const n of nodes) sort(n.filhos)
  }
  sort(roots)
  return roots
}

export function calcTotais(nodo: Nodo, bdiGlobal: number): number {
  if (nodo.filhos.length === 0) {
    nodo.total = (nodo.quantidade ?? 0) * (nodo.custo_unitario ?? 0)
    const bdi = nodo.bdi_especifico ?? bdiGlobal
    nodo.totalComBdi = nodo.total * (1 + bdi / 100)
  } else {
    nodo.filhos.forEach(f => calcTotais(f, bdiGlobal))
    nodo.total = nodo.filhos.reduce((s, f) => s + f.total, 0)
    nodo.totalComBdi = nodo.filhos.reduce((s, f) => s + f.totalComBdi, 0)
  }
  return nodo.total
}

export function atribuirNumeros(nodes: Nodo[], digitos: number[], prefix = '', nivel = 1) {
  nodes.sort((a, b) => a.ordem - b.ordem)
  const width = digitos[nivel - 1] ?? digitos[digitos.length - 1] ?? 1
  nodes.forEach((node, i) => {
    const seq = String(i + 1).padStart(width, '0')
    node.numero = prefix ? `${prefix}.${seq}` : seq
    atribuirNumeros(node.filhos, digitos, node.numero, nivel + 1)
  })
}

export function coletarNumeros(nodes: Nodo[], nivel = 1): { id: string; numero: string; nivel: number }[] {
  return nodes.flatMap(n => [
    { id: n.id, numero: n.numero, nivel },
    ...coletarNumeros(n.filhos, nivel + 1),
  ])
}

export function flattenTree(nodos: Nodo[], depth = 0): { nodo: Nodo; depth: number }[] {
  return nodos.flatMap(n => [{ nodo: n, depth }, ...flattenTree(n.filhos, depth + 1)])
}

const LEAF_FIELDS = ['codigo', 'descricao', 'unidade', 'quantidade', 'custo_unitario', 'bdi_especifico'] as const
const LEAF_FIELDS_COMPOSICAO = ['codigo', 'descricao', 'unidade', 'quantidade', 'bdi_especifico'] as const
const GROUP_FIELDS = ['descricao'] as const

// custo_unitario nunca é editável quando o código do item é uma composição —
// o valor é sempre calculado a partir dos insumos utilizados.
export function editableFields(nodo: { filhos: unknown[]; codigo: string | null }, composicaoCodigos: Set<string>): readonly string[] {
  if (nodo.filhos.length > 0) return GROUP_FIELDS
  if (nodo.codigo && composicaoCodigos.has(nodo.codigo)) return LEAF_FIELDS_COMPOSICAO
  return LEAF_FIELDS
}

export function fieldToStr(it: EstruturaItem, field: string): string {
  const v = (it as any)[field]
  return v != null ? String(v) : ''
}
