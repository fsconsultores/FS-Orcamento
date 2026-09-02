/** Escala tipográfica executiva do Caderno de Orçamento (paisagem). */
export const CADERNO_FONT = {
  bannerTitle: 19,
  bannerSub: 14,
  heroLabel: 18,
  heroValue: 20,
  subsection: 13,
  body: 13,
  bodySm: 12,
  /** Tabelas de resumo, listagens e ABC */
  tableBody: 11.5,
  tableHead: 12,
  tableFoot: 11.5,
  /** Planilhas detalhadas (Sintética, Analítica, Preços Unitários) — estritamente compactas */
  tableDense: 7,
  tableDenseHead: 7,
  coverTitle: 31,
  coverSubtitle: 19,
  coverMeta: 14,
  dividerNum: 19,
  dividerTitle: 27,
  dividerSub: 15,
  chartTitle: 14,
  kpiLabel: 11.5,
  kpiValue: 16,
  kpiSub: 11,
  pageFooter: 12,
  docHeaderBrand: 11,
  docHeaderMeta: 10,
} as const

export function cadernoTableBodyStyles(fontSize = CADERNO_FONT.tableBody) {
  return {
    fontSize,
    cellPadding: 1.4,
    valign: 'middle' as const,
    overflow: 'linebreak' as const,
    lineColor: '#cbd5e1',
    lineWidth: 0.1,
  }
}

/** Corpo compacto — fontSize 7, sem quebra em colunas numéricas. */
export function cadernoTableDenseStyles(fontSize = CADERNO_FONT.tableDense) {
  return {
    fontSize,
    cellPadding: 1,
    valign: 'middle' as const,
    overflow: 'hidden' as const,
    lineColor: '#cbd5e1',
    lineWidth: 0.1,
  }
}

export function cadernoTableHeadStyles(fontSize = CADERNO_FONT.tableHead) {
  return {
    fillColor: undefined as string | undefined,
    textColor: '#ffffff',
    fontStyle: 'bold' as const,
    halign: 'center' as const,
    fontSize,
    cellPadding: 1.2,
  }
}

export function cadernoTableDenseHeadStyles(fontSize = CADERNO_FONT.tableDenseHead) {
  return {
    fillColor: undefined as string | undefined,
    textColor: '#ffffff',
    fontStyle: 'bold' as const,
    halign: 'center' as const,
    fontSize,
    cellPadding: 1,
    overflow: 'hidden' as const,
  }
}
