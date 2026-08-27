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
// o valor é sempre calculado a partir dos insumos utilizados. bdi_especifico
// só é editável no modelo de acréscimo BDI — nos outros dois modos a coluna
// nem aparece na grid (ver planilha-view.tsx), então não pode ser um destino
// válido de navegação por teclado (Tab/Enter entre células). Nenhum campo é
// editável no grupo/itens "Taxa de Administração" auto-gerenciados
// (eh_taxa_administracao) — o grupo inteiro é recriado do zero a cada
// mudança nos demais itens (sincronizarItensTaxaAdministracao), então
// qualquer edição manual (descrição, quantidade, custo) seria descartada na
// próxima sincronização. Volta a ser editável normalmente quando o item
// deixa de ser auto-gerenciado (ver aplicarModeloAcrescimo).
export function editableFields(nodo: { filhos: unknown[]; codigo: string | null; eh_taxa_administracao?: boolean }, composicaoCodigos: Set<string>, usaBdi = true): readonly string[] {
  if (nodo.eh_taxa_administracao) return []
  const fields = nodo.filhos.length > 0
    ? GROUP_FIELDS
    : nodo.codigo && composicaoCodigos.has(nodo.codigo) ? LEAF_FIELDS_COMPOSICAO : LEAF_FIELDS
  return usaBdi ? fields : fields.filter(f => f !== 'bdi_especifico')
}

export function fieldToStr(it: EstruturaItem, field: string): string {
  const v = (it as any)[field]
  return v != null ? String(v) : ''
}
