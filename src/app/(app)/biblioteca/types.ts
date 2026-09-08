import type { CategoriaAbc } from '@/lib/curva-abc'

export const BIBLIOTECA_PAGE_SIZE = 100

export type BibliotecaTab = 'insumos' | 'composicoes'

export interface BibliotecaFilters {
  tab: BibliotecaTab
  q: string
  /** Só aplicável na aba insumos — composições não têm campo de categoria (decisão confirmada). */
  categoria: CategoriaAbc | null
}

export interface BibliotecaInsumoRow {
  id: string
  codigo: string
  descricao: string
  unidade: string
  grupo: string | null
  preco_base: number
  data_referencia: string | null
  usadoEm: number
}

export interface BibliotecaComposicaoRow {
  id: string
  codigo: string
  descricao: string
  unidade: string
  custo_unitario: number
  incompleta?: boolean
  usadoEm: number
}

export interface BibliotecaData {
  totalInsumos: number
  totalComposicoes: number
  total: number
  insumos: BibliotecaInsumoRow[]
  composicoes: BibliotecaComposicaoRow[]
}
