export { PDF_COLORS, CADERNO_BRAND, type PdfColorPalette } from './theme'
export { BRAND_LOGO_PNG_PATH, BRAND_LOGO_PNG_WHITE_PATH, BRAND_LOGO_PNG_ASPECT } from './assets'
export {
  CADERNO_FONT,
  cadernoTableBodyStyles,
  cadernoTableHeadStyles,
  cadernoTableDenseStyles,
  cadernoTableDenseHeadStyles,
} from './typography'
export { filterRealCategoriesForTop5 } from './filters'
export { drawTop5HorizontalBarChart } from './charts'
export { drawCadernoKpiRow, CADERNO_KPI_PRIMARY, CADERNO_KPI_NEUTRAL, type CadernoKpiCard } from './kpi'
export {
  drawResumoGeralDashboardPage,
  drawResumoGeralDetailTables,
  resolveServicosEstimadosParaTabela,
  filterServicosEstimadosVisiveis,
  splitResumoGeralDados,
  isServicoEstimadoNode,
  type ResumoGeralSplitResult,
  type ResumoGeralDashboardInput,
  type ResumoGeralTabelasInput,
  type ResumoGeralTabelasOptions,
} from './resumo-geral'
export { drawCustoM2SectionContent, type CustoM2SectionInput, type CustoM2Pavimento } from './custo-m2'
export {
  LISTA_INSUMOS_HEADERS,
  listaInsumosColumnStyles,
  buildListaInsumosRow,
  buildListaInsumosBody,
  drawListaInsumosGrupoTable,
} from './lista-insumos'
export {
  globalTableStyles,
  globalTableStylesNoZebra,
  planilhaPrecosTableStyles,
  ABC_TABLE_BODY_STYLES,
  ABC_TABLE_HEAD_STYLES,
} from './global-table-styles'
export {
  ESTIMADO_HIGHLIGHT_FILL,
  ESTIMADO_HIGHLIGHT_TEXT,
  resolveDestacarEstimados,
  textoPareceEstimado,
  isInsumoRowEstimado,
  isCadernoNodeEstimado,
  applyEstimadoCellHighlight,
  willDrawEstimadoHighlight,
} from './estimado-highlight'
export {
  abcTableColumnStylesLandscape,
  abcTableHeadCompact,
} from './abc-table'
export {
  PDF_TABLE_MARGIN_LATERAL,
  PDF_TABLE_MARGIN_BOTTOM,
  PDF_PAGE_MARGIN,
  pdfContentWidth,
  pdfTableLayout,
  pdfAutoTableMargins,
  resumoDetalhamentoColumnStyles,
  resumoServicosColumnStyles,
  resumoValorColumnStyles,
  planilhaAnaliticaCadernoColumnStyles,
  planilhaSinteticaColumnStyles,
  planilhaPrecosColumnStyles,
  PDF_PRECOS_HEAD_SUBROW_FONT,
} from './table-layout'
export {
  PDF_MARGIN_DEFAULT,
  PDF_BANNER_HEIGHT,
  PDF_TABLE_HEAD_STYLES,
  PDF_TABLE_BODY_STYLES,
  PDF_TABLE_DENSE_BODY_STYLES,
  PDF_TABLE_DENSE_HEAD_STYLES,
  drawReportBanner,
  drawPageNumbers,
  contentStartY,
  drawCadernoDocumentHeader,
  drawBrandCornerBars,
  getLastAutoTableFinalY,
  ensureMinSpace,
  ensureSectionBannerFits,
} from './layout'
export { drawCadernoCoverPage, formatRevisaoLabel, type CadernoCoverInfo } from './cover'
export {
  drawStandardHeader,
  standardHeaderAutoTableHooks,
  standardHeaderContinuationHook,
  standardHeaderTableTop,
  STANDARD_HEADER_HEIGHT,
  STANDARD_HEADER_CONTENT_GAP,
  type StandardHeaderData,
} from './standard-header'
export { createLandscapeA4Pdf, addLandscapeA4Page, type LandscapeA4Pdf } from './pdf-document'
