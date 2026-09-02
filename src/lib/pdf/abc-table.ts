/**
 * Colunas e cabeçalho compacto da Curva ABC — estilos via globalTableStyles.
 */
import type { RowInput } from 'jspdf-autotable'

export function abcTableColumnStylesLandscape(contentW = 269) {
  const fixed =
    8 + 18 + 12 + 24 + 26 + 28 + 12 + 14 + 12
  const descricao = Math.max(60, contentW - fixed)

  return {
    0: { cellWidth: 8, halign: 'center' as const, overflow: 'hidden' as const, minCellWidth: 8 },
    1: { cellWidth: 18, halign: 'center' as const, overflow: 'hidden' as const, minCellWidth: 18 },
    2: { cellWidth: descricao, halign: 'left' as const, minCellWidth: 60 },
    3: { cellWidth: 12, halign: 'center' as const, overflow: 'hidden' as const, minCellWidth: 12 },
    4: { cellWidth: 24, halign: 'center' as const, overflow: 'hidden' as const, minCellWidth: 24 },
    5: { cellWidth: 26, halign: 'center' as const, overflow: 'hidden' as const, minCellWidth: 26 },
    6: { cellWidth: 28, halign: 'center' as const, overflow: 'hidden' as const, minCellWidth: 28 },
    7: { cellWidth: 12, halign: 'center' as const, overflow: 'hidden' as const, minCellWidth: 12 },
    8: { cellWidth: 14, halign: 'center' as const, overflow: 'hidden' as const, minCellWidth: 14 },
    9: { cellWidth: 12, halign: 'center' as const, overflow: 'hidden' as const, minCellWidth: 12 },
  }
}

export function abcTableHeadCompact(): RowInput[] {
  return [['#', 'Cód.', 'Descrição', 'Und', 'Quantidade', 'R$ Unit.', 'R$ Total', '%', '% Acum.', 'Classe']]
}
