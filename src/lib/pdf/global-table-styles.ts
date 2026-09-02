/**
 * Design System — estilos unificados para TODAS as tabelas autoTable do Caderno e relatórios avulsos.
 */
import { CADERNO_BRAND, PDF_COLORS } from './theme'

export const globalTableStyles = {
  styles: {
    fontSize: 7,
    cellPadding: 2,
    valign: 'middle' as const,
    overflow: 'linebreak' as const,
    lineColor: PDF_COLORS.tableBorder,
    lineWidth: 0.1,
    textColor: PDF_COLORS.textPrimary,
  },
  headStyles: {
    fillColor: CADERNO_BRAND.primary,
    textColor: '#ffffff',
    fontStyle: 'bold' as const,
    halign: 'center' as const,
    fontSize: 7,
    cellPadding: 2,
    overflow: 'hidden' as const,
  },
  alternateRowStyles: {
    fillColor: '#f9fafb',
  },
  footStyles: {
    fillColor: PDF_COLORS.tableFootFill,
    textColor: PDF_COLORS.textPrimary,
    fontStyle: 'bold' as const,
    halign: 'center' as const,
    fontSize: 7,
    cellPadding: 2,
    overflow: 'hidden' as const,
    lineWidth: 0.1,
  },
} as const

/** Mesmo padrão global, sem zebra — linhas semânticas (estimado/grupo/ABC) definem a cor. */
export const globalTableStylesNoZebra = {
  styles: globalTableStyles.styles,
  headStyles: globalTableStyles.headStyles,
  footStyles: globalTableStyles.footStyles,
} as const

/** Estilos compactos — Planilha de Preços Unitários (valores financeiros em linha única). */
export const planilhaPrecosTableStyles = {
  ...globalTableStylesNoZebra,
  styles: {
    ...globalTableStyles.styles,
    fontSize: 6.5,
    cellPadding: 1,
  },
  headStyles: {
    ...globalTableStyles.headStyles,
    fontSize: 6.5,
    cellPadding: 1,
  },
  footStyles: {
    ...globalTableStyles.footStyles,
    fontSize: 6.5,
    cellPadding: 1,
  },
} as const

/** @deprecated Use globalTableStyles — mantido por compatibilidade com imports legados. */
export const ABC_TABLE_BODY_STYLES = globalTableStyles.styles
/** @deprecated Use globalTableStyles.headStyles */
export const ABC_TABLE_HEAD_STYLES = globalTableStyles.headStyles
