/**
 * Destaque visual de linhas estimadas — cor oficial Gabriel (#FEF9C3).
 * Centralizado para Caderno e exports avulsos de Planilha Analítica/Preços.
 */
import type { CellHookData } from 'jspdf-autotable'
import { pareceEstimado } from '@/lib/orcamento/estimado-sugestao'

export const ESTIMADO_HIGHLIGHT_FILL = '#FEF9C3'
export const ESTIMADO_HIGHLIGHT_TEXT = '#92400e'

/** Normaliza a flag da UI — só `false` explícito desliga o destaque. */
export function resolveDestacarEstimados(value: boolean | undefined): boolean {
  return value !== false
}

/** Fallback duplo: flag do dado OU padrão textual (regex + "estimado"). */
export function textoPareceEstimado(descricao: string | null | undefined): boolean {
  if (!descricao) return false
  const trimmed = descricao.trim()
  if (!trimmed) return false
  return pareceEstimado(trimmed) || trimmed.toLowerCase().includes('estimado')
}

export function isInsumoRowEstimado(estimadoFlag: boolean | undefined, descricao: string): boolean {
  return estimadoFlag === true || textoPareceEstimado(descricao)
}

export function isCadernoNodeEstimado(estimadoFlag: boolean, descricao: string): boolean {
  return estimadoFlag === true || textoPareceEstimado(descricao)
}

/** Aplica fill/texto/bold; retorna true se o destaque foi aplicado. */
export function applyEstimadoCellHighlight(
  cellData: CellHookData,
  destacarEstimados: boolean,
  isEstimado: boolean,
): boolean {
  if (!destacarEstimados || !isEstimado) return false
  cellData.cell.styles.fillColor = ESTIMADO_HIGHLIGHT_FILL
  cellData.cell.styles.textColor = ESTIMADO_HIGHLIGHT_TEXT
  cellData.cell.styles.fontStyle = 'bold'
  return true
}

/** willDrawCell — reaplica cor após alternateRowStyles (zebra) do autoTable. */
export function willDrawEstimadoHighlight(
  cellData: CellHookData,
  destacarEstimados: boolean,
  isEstimado: boolean,
): void {
  applyEstimadoCellHighlight(cellData, destacarEstimados, isEstimado)
}
