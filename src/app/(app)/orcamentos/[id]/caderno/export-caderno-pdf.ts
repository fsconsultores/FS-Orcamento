import type { jsPDF } from 'jspdf'
import type { RowInput } from 'jspdf-autotable'
import { fmt, fmtQtd, fmtPct, type AbcItem } from '@/lib/curva-abc'
import { formatDate } from '@/lib/format-date'
import type { CadernoData, CadernoNode, AbcClasse } from '@/lib/orcamento/caderno'
import { slugFilename } from '../relatorios/exporters/xlsx-shared'
import {
  drawAbcChart,
  drawAbcKpiCards,
  abcTableBody,
  abcTableFoot,
  abcRowFillColor,
  abcRowTextColor,
} from '@/lib/pdf/abc-section'
import {
  PDF_COLORS,
  CADERNO_BRAND,
  CADERNO_FONT,
  drawCadernoCoverPage,
  drawBrandCornerBars,
  drawResumoGeralDashboardPage,
  drawResumoGeralDetailTables,
  splitResumoGeralDados,
  filterServicosEstimadosVisiveis,
  drawCustoM2SectionContent,
  drawListaInsumosGrupoTable,
  globalTableStyles,
  globalTableStylesNoZebra,
  planilhaPrecosTableStyles,
  abcTableColumnStylesLandscape,
  abcTableHeadCompact,
  pdfContentWidth,
  pdfTableLayout,
  PDF_PAGE_MARGIN,
  PDF_PRECOS_HEAD_SUBROW_FONT,
  planilhaAnaliticaCadernoColumnStyles,
  planilhaPrecosColumnStyles,
  formatRevisaoLabel,
  createLandscapeA4Pdf,
  addLandscapeA4Page,
  drawStandardHeader,
  standardHeaderAutoTableHooks,
  standardHeaderTableTop,
  type StandardHeaderData,
  resolveDestacarEstimados,
  isCadernoNodeEstimado,
  isInsumoRowEstimado,
  textoPareceEstimado,
  applyEstimadoCellHighlight,
  willDrawEstimadoHighlight,
} from '@/lib/pdf'

const GROUP_FILL = PDF_COLORS.tableGroupFill

// Classe ABC por item — mesmo mapeamento canônico da Curva ABC (ver
// src/components/ui/badge.tsx): A = verde (maior prioridade de acompanhamento,
// concentra ~80% do custo), C = vermelho. Estava invertido aqui (bug real,
// corrigido durante a reformulação de UI/UX).
const ABC_BG: Record<AbcClasse, string> = { A: '#dcfce7', B: '#fef3c7', C: '#fee2e2' }
const ABC_FG: Record<AbcClasse, string> = { A: '#15803d', B: '#b45309', C: '#b91c1c' }

function buildStandardHeaderData(data: CadernoData): StandardHeaderData {
  return {
    cliente: data.orcamento.cliente,
    nomeObra: data.orcamento.nome_obra,
    revisao: formatRevisaoLabel(data.orcamento.numero_revisao),
    data: formatDate(new Date()),
  }
}

// ─── Helpers de layout ────────────────────────────────────────────────────────

function addDivider(doc: jsPDF, pageW: number, pageH: number, numero: string, titulo: string, subtitle?: string) {
  addLandscapeA4Page(doc)
  // Mesmo tratamento da capa — fundo branco, texto colorido (nunca o
  // inverso: fundo cheio de cor com texto branco) — pra ser realmente
  // "parecido com a capa", não só usar os mesmos hex em outro arranjo.
  doc.setFillColor('#ffffff')
  doc.rect(0, 0, pageW, pageH, 'F')
  drawBrandCornerBars(doc, pageW, pageH, CADERNO_BRAND.secondary)

  doc.setTextColor(CADERNO_BRAND.secondary)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(CADERNO_FONT.dividerNum)
  doc.text(numero, pageW / 2, pageH / 2 - 14, { align: 'center' })

  doc.setTextColor(CADERNO_BRAND.primary)
  doc.setFontSize(CADERNO_FONT.dividerTitle)
  doc.text(titulo, pageW / 2, pageH / 2 - 2, { align: 'center' })

  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(CADERNO_FONT.dividerSub)
    doc.setTextColor('#6b7280')
    doc.text(subtitle, pageW / 2, pageH / 2 + 10, { align: 'center' })
  }
}

// ─── Seção: Resumo Geral do Orçamento ────────────────────────────────────────

async function drawResumoGeralSection(
  doc: jsPDF, data: CadernoData, margin: number, contentW: number, pageH: number,
  incluirServicosComInsumoEstimado: boolean, servicosComInsumoEstimadoOcultos: Set<string>
) {
  const { area_total, area_coberta, area_equivalente } = data.orcamento
  const headerData = buildStandardHeaderData(data)
  const sectionTitle = 'RESUMO GERAL DO ORÇAMENTO'

  const tabelasInput = {
    arvore: data.arvore,
    servicosEstimados: data.servicosEstimados,
    servicosComInsumoEstimado: data.servicosComInsumoEstimado,
    totalGeralComBdi: data.totalGeralComBdi,
    totalServicosEstimados: data.totalServicosEstimados,
  }

  const split = splitResumoGeralDados(tabelasInput)
  const servicosEstimadosVisiveis = filterServicosEstimadosVisiveis(
    split.servicosEstimados,
    data.servicosComInsumoEstimado,
    incluirServicosComInsumoEstimado,
    servicosComInsumoEstimadoOcultos,
  )

  addLandscapeA4Page(doc)
  const dashboardY = drawStandardHeader(doc, headerData, sectionTitle)
  drawResumoGeralDashboardPage(doc, margin, contentW, dashboardY, {
    totalOrcadoA: split.totalOrcadoA,
    totalServicosEstimadosB: split.totalServicosEstimadosB,
    areaTotal: area_total,
    areaCoberta: area_coberta,
    areaEquivalente: area_equivalente,
    distribuicaoCustos: data.distribuicaoCustos,
  })

  addLandscapeA4Page(doc)
  const tablesY = drawStandardHeader(doc, headerData, sectionTitle)

  await drawResumoGeralDetailTables(
    doc,
    margin,
    contentW,
    pageH,
    tablesY,
    headerData,
    sectionTitle,
    {
      ...tabelasInput,
      servicosEstimadosVisiveis,
    },
    {
      incluirServicosComInsumoEstimado,
      servicosComInsumoEstimadoOcultos,
    },
  )
}

// ─── Seção: Custo / m² ────────────────────────────────────────────────────────

async function drawCustoM2Section(doc: jsPDF, data: CadernoData, margin: number, contentW: number, pageH: number) {
  addLandscapeA4Page(doc)

  const headerData = buildStandardHeaderData(data)
  const sectionTitle = 'CUSTO / M²'
  const redrawHeader = () => drawStandardHeader(doc, headerData, sectionTitle)

  const A = data.totalGeralComBdi
  const B = data.totalServicosEstimados
  const { local, area_total, area_coberta, area_equivalente } = data.orcamento

  drawCustoM2SectionContent(doc, margin, contentW, pageH, redrawHeader(), {
    local,
    areaTotal: area_total,
    areaCoberta: area_coberta,
    areaEquivalente: area_equivalente,
    pavimentos: data.pavimentos,
    custoTotal: A + B,
  }, redrawHeader)
}

// ─── Seção: Planilha de Preços Unitários ─────────────────────────────────────

function flattenArvore(
  nodes: CadernoNode[],
  depth = 0,
  ancestorEstimado = false,
  out: { node: CadernoNode; depth: number; estimado: boolean }[] = [],
) {
  for (const n of nodes) {
    // Um grupo marcado como estimado não marca cada filho individualmente no
    // banco (só o próprio grupo) — herda pra baixo aqui pra destacar a
    // subárvore inteira, não só a linha-pai.
    const estimado = ancestorEstimado || n.estimado
    out.push({ node: n, depth, estimado })
    flattenArvore(n.filhos, depth + 1, estimado, out)
  }
  return out
}

// Soma "com BDI" de um nó, substituindo pelo valor_estimado (override manual
// da aba Estimados) quando o próprio nó tem um — do contrário usa o total
// calculado (ou a soma dos filhos, já refletindo overrides deles). valor_
// estimado é digitado SEM BDI (mesma convenção de caderno.ts/
// valorEstimadoComBdi — o placeholder do campo na aba Estimados mostra
// node.total, que é sem BDI), então aplica aqui a mesma taxa de BDI que já
// se aplicaria ao total calculado do nó — sem isso, o override apareceria
// sem BDI no meio de uma planilha onde todo o resto tem, e divergiria do
// valor mostrado em "(B) Serviços Estimados" (que já faz esse ajuste).
function totalComBdiEfetivo(node: CadernoNode): number {
  if (node.estimado && node.valor_estimado != null) {
    return node.total > 0 ? node.valor_estimado * (node.totalComBdi / node.total) : node.valor_estimado
  }
  if (node.filhos.length === 0) return node.totalComBdi
  return node.filhos.reduce((s, f) => s + totalComBdiEfetivo(f), 0)
}

async function drawPlanilhaPrecosSection(doc: jsPDF, data: CadernoData, margin: number, contentW: number, destacarEstimados: boolean) {
  const { autoTable } = await import('jspdf-autotable')

  const pageW = doc.internal.pageSize.getWidth()
  const tableLayout = pdfTableLayout(pageW)
  const headerData = buildStandardHeaderData(data)
  const sectionTitle = 'PLANILHA DE PREÇOS UNITÁRIOS'
  const tableTop = standardHeaderTableTop()
  const headerHooks = standardHeaderAutoTableHooks(doc, headerData, sectionTitle, { skipFirstTablePage: true })

  addLandscapeA4Page(doc)

  // arvoreCompleta (não arvore): itens estimados ficam visíveis aqui, só
  // destacados em amarelo — não somem da planilha por estarem sem preço
  // fechado. O Total Orçado (A) e a Curva ABC continuam calculados só sobre
  // itens confirmados (data.arvore), essa seção é só de exibição.
  const flat = flattenArvore(data.arvoreCompleta)
  // "Preço de Custo" (sem BDI) não tem override — valor_estimado é sempre um
  // valor final (ver sumLeaves em caderno.ts), então só a coluna com BDI é
  // ajustada por item; o detalhamento de custo de um item com override
  // continua mostrando o calculado (melhor estimativa disponível).
  const totalGeralCompleto = data.arvoreCompleta.reduce((s, n) => s + n.total, 0)
  const totalGeralComBdiCompleto = data.arvoreCompleta.reduce((s, n) => s + totalComBdiEfetivo(n), 0)

  // BDI efetivo do orçamento inteiro é zero quando o total com BDI bate com o
  // total sem BDI — cobre tanto bdi_global=0 quanto o caso (mais raro) de todo
  // bdi_especifico individual também ser 0. Sem BDI em lugar nenhum, "Preço de
  // Custo" x "Preço de Venda" são sempre o mesmo número — pedido explícito pra
  // não rotular como "custo" um preço que já é o preço final, nem mostrar uma
  // coluna de BDI (%) que só mostraria 0,00% em toda linha.
  const temBdi = Math.abs(totalGeralComBdiCompleto - totalGeralCompleto) >= 0.01
  const totalParaPct = temBdi ? totalGeralComBdiCompleto : totalGeralCompleto
  const pct = (v: number) => fmtPct(totalParaPct > 0 ? (v / totalParaPct) * 100 : 0)

  const body: RowInput[] = flat.map(({ node, depth }) => {
    if (!temBdi) {
      const totalEfetivo = totalComBdiEfetivo(node)
      if (node.tipo === 'grupo') {
        return [node.numero, node.codigo ?? '', node.descricao, '', '', '', '', '', fmt(totalEfetivo), pct(totalEfetivo), '']
      }
      return [
        node.numero,
        node.codigo ?? '',
        node.descricao,
        node.unidade ?? '',
        fmtQtd(node.quantidade ?? 0),
        fmt(node.custoMat),
        fmt(node.custoMo),
        fmt(node.custoTerceiros),
        fmt(node.custoUnitario),
        fmt(totalEfetivo),
        pct(totalEfetivo),
        node.classeAbc ?? '',
      ]
    }
    // Preço de Custo (sem BDI) x BDI (%) x Preço de Venda (com BDI) lado a lado
    // — formato pedido explicitamente pra bater com o modelo de planilha de
    // preços unitários que o cliente já usa fora do sistema. Grupo não tem "um"
    // BDI (os filhos podem ter taxas diferentes), então mostra o markup efetivo
    // agregado (node.bdiPercentual — ver comentário em caderno.ts) em vez de
    // deixar em branco.
    const totalComBdiRow = totalComBdiEfetivo(node)
    if (node.tipo === 'grupo') {
      return [
        node.numero, node.codigo ?? '', node.descricao, '', '',
        '', '', '',
        '', fmt(node.total),
        fmtPct(node.bdiPercentual),
        '', fmt(totalComBdiRow),
        pct(totalComBdiRow),
        '',
      ]
    }
    return [
      node.numero,
      node.codigo ?? '',
      node.descricao,
      node.unidade ?? '',
      fmtQtd(node.quantidade ?? 0),
      fmt(node.custoMat),
      fmt(node.custoMo),
      fmt(node.custoTerceiros),
      fmt(node.custoUnitario),
      fmt(node.total),
      fmtPct(node.bdiPercentual),
      fmt(node.custoUnitarioComBdi),
      fmt(totalComBdiRow),
      pct(totalComBdiRow),
      node.classeAbc ?? '',
    ]
  })

  const head: RowInput[] = temBdi
    ? [
        [
          { content: 'Item', rowSpan: 2 },
          { content: 'Cód.', rowSpan: 2 },
          { content: 'Descrição', rowSpan: 2 },
          { content: 'Und', rowSpan: 2 },
          { content: 'Qtd', rowSpan: 2 },
          { content: 'Detalhamento do Custo Unitário', colSpan: 3 },
          { content: 'Preço de Custo', colSpan: 2 },
          { content: 'BDI (%)', rowSpan: 2 },
          { content: 'Preço de Venda', colSpan: 2 },
          { content: '%', rowSpan: 2 },
          { content: 'ABC', rowSpan: 2 },
        ],
        ['Mat/Equip', 'M.O.', 'Terceiros', 'Unitário', 'Total', 'Unitário', 'Total'],
      ]
    : [
        [
          { content: 'Item', rowSpan: 2 },
          { content: 'Cód.', rowSpan: 2 },
          { content: 'Descrição', rowSpan: 2 },
          { content: 'Und', rowSpan: 2 },
          { content: 'Qtd', rowSpan: 2 },
          { content: 'Detalhamento do Custo Unitário', colSpan: 3 },
          { content: 'Preço', colSpan: 2 },
          { content: '%', rowSpan: 2 },
          { content: 'ABC', rowSpan: 2 },
        ],
        ['Mat/Equip', 'M.O.', 'Terceiros', 'Unitário', 'Total'],
      ]

  const foot: RowInput[] = temBdi
    ? [[
        '', '', 'TOTAL GERAL', '', '',
        '', '', '',
        '', fmt(totalGeralCompleto),
        fmtPct(totalGeralCompleto > 0 ? (totalGeralComBdiCompleto / totalGeralCompleto - 1) * 100 : 0),
        '', fmt(totalGeralComBdiCompleto),
        fmtPct(100),
        '',
      ]]
    : [['', '', 'TOTAL GERAL', '', '', '', '', '', fmt(totalGeralCompleto), fmtPct(100), '']]

  const columnStylesComBdi = planilhaPrecosColumnStyles(tableLayout.tableWidth, true)
  const columnStylesSemBdi = planilhaPrecosColumnStyles(tableLayout.tableWidth, false)
  const abcColIndex = temBdi ? 14 : 11

  drawStandardHeader(doc, headerData, sectionTitle)

  autoTable(doc, {
    startY: tableTop,
    didDrawPage: headerHooks.didDrawPage,
    margin: headerHooks.margin,
    tableWidth: tableLayout.tableWidth,
    head,
    body,
    foot,
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    ...planilhaPrecosTableStyles,
    columnStyles: (temBdi ? columnStylesComBdi : columnStylesSemBdi) as unknown as Record<number, import('jspdf-autotable').Styles>,
    didParseCell: (cellData) => {
      if (cellData.section === 'head' && cellData.row.index === 1) {
        cellData.cell.styles.fontSize = PDF_PRECOS_HEAD_SUBROW_FONT
        cellData.cell.styles.cellPadding = 1
        return
      }
      if (cellData.section === 'body' || cellData.section === 'foot') {
        const moneyCols = temBdi
          ? new Set([5, 6, 7, 8, 9, 11, 12])
          : new Set([5, 6, 7, 8, 9])
        if (moneyCols.has(cellData.column.index)) {
          cellData.cell.styles.overflow = 'hidden'
          cellData.cell.styles.fontSize = 6.5
          cellData.cell.styles.cellPadding = 1
        }
      }
      if (cellData.section !== 'body') return
      const { node, estimado, depth } = flat[cellData.row.index]
      const isEstimado = isCadernoNodeEstimado(estimado, node.descricao)

      if (applyEstimadoCellHighlight(cellData, destacarEstimados, isEstimado)) return

      if (cellData.column.index === 2) {
        cellData.cell.styles.halign = 'left'
        cellData.cell.styles.cellPadding = {
          top: 2,
          bottom: 2,
          left: 2 + depth * 3,
          right: 2,
        }
      }
      if (node.tipo === 'grupo') {
        cellData.cell.styles.fillColor = GROUP_FILL
        cellData.cell.styles.fontStyle = 'bold'
        return
      }
      if (cellData.column.index === abcColIndex && node.classeAbc) {
        cellData.cell.styles.fillColor = ABC_BG[node.classeAbc]
        cellData.cell.styles.textColor = ABC_FG[node.classeAbc]
        cellData.cell.styles.fontStyle = 'bold'
      }
    },
    willDrawCell: (cellData) => {
      if (cellData.section !== 'body') return
      const { node, estimado } = flat[cellData.row.index]
      willDrawEstimadoHighlight(cellData, destacarEstimados, isCadernoNodeEstimado(estimado, node.descricao))
    },
  })
}

// ─── Seção: Curva ABC ─────────────────────────────────────────────────────────

async function drawAbcSection(doc: jsPDF, items: AbcItem[], title: string, margin: number, contentW: number, headerData: StandardHeaderData) {
  const { autoTable } = await import('jspdf-autotable')

  const pageW = doc.internal.pageSize.getWidth()
  const tableLayout = pdfTableLayout(pageW)
  const headerHooks = standardHeaderAutoTableHooks(doc, headerData, title, { skipFirstTablePage: true })

  addLandscapeA4Page(doc)
  const contentY = drawStandardHeader(doc, headerData, title)

  const cardY = contentY
  const cardH = drawAbcKpiCards(doc, items, margin, cardY, contentW, CADERNO_BRAND.kpiPrimary)

  const chartTitleY = cardY + cardH + 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(CADERNO_FONT.chartTitle)
  doc.setTextColor('#374151')
  doc.text('Curva ABC Acumulada', margin, chartTitleY)

  const chartY = chartTitleY + 2
  const chartH = 58
  drawAbcChart(doc, items, margin, chartY, contentW, chartH)

  const tableStartY = chartY + chartH + 6
  autoTable(doc, {
    startY: tableStartY,
    tableWidth: tableLayout.tableWidth,
    margin: headerHooks.margin,
    didDrawPage: headerHooks.didDrawPage,
    head: abcTableHeadCompact(),
    body: abcTableBody(items),
    foot: abcTableFoot(items),
    showFoot: 'lastPage',
    ...globalTableStyles,
    columnStyles: abcTableColumnStylesLandscape(tableLayout.tableWidth),
    didParseCell: (cellData) => {
      if (cellData.section !== 'body') return
      const classe = (cellData.row.raw as string[])[9]
      cellData.cell.styles.fillColor = abcRowFillColor(classe)
      if (cellData.column.index === 9) {
        cellData.cell.styles.textColor = abcRowTextColor(classe)
        cellData.cell.styles.fontStyle = 'bold'
        cellData.cell.styles.halign = 'center'
      }
    },
  })
}

// ─── Seção: Planilha Analítica ────────────────────────────────────────────────

async function drawPlanilhaAnaliticaSection(doc: jsPDF, data: CadernoData, margin: number, contentW: number, pageH: number, destacarEstimados: boolean) {
  const { autoTable } = await import('jspdf-autotable')

  const pageW = doc.internal.pageSize.getWidth()
  const tableLayout = pdfTableLayout(pageW)
  const headerData = buildStandardHeaderData(data)
  const sectionTitle = 'PLANILHA ANALÍTICA DE PREÇOS UNITÁRIOS'
  const headerHooks = standardHeaderAutoTableHooks(doc, headerData, sectionTitle, { skipFirstTablePage: true })

  addLandscapeA4Page(doc)
  const contentY = drawStandardHeader(doc, headerData, sectionTitle)

  const rows = data.planilhaAnalitica

  if (rows.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(CADERNO_FONT.bodySm)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text('Nenhum item com composição detalhada neste orçamento.', margin, contentY + 4)
    return
  }

  const body: RowInput[] = rows.map(row => {
    if (row.tipo === 'grupo') {
      return [{
        content: `${row.numero}   ${row.descricao}`,
        colSpan: 8,
        styles: { fillColor: CADERNO_BRAND.primary, textColor: '#ffffff', fontStyle: 'bold', halign: 'left' },
      }]
    }
    if (row.tipo === 'item') {
      return [row.numero, row.codigo, row.descricao, row.unidade, '', fmt(row.custoUnitario), fmt(row.custoTotal), row.classeAbc ?? '']
    }
    return [
      '',
      row.codigo,
      row.descricao,
      row.unidade,
      row.indice.toLocaleString('pt-BR', { maximumFractionDigits: 6 }),
      fmt(row.custoUnit),
      fmt(row.custoTotal),
      '',
    ]
  })

  autoTable(doc, {
    startY: contentY,
    tableWidth: tableLayout.tableWidth,
    margin: headerHooks.margin,
    didDrawPage: headerHooks.didDrawPage,
    head: [['Item', 'Código', 'Descrição', 'Und', 'Índice', 'R$ Unit.', 'R$ Total', 'ABC']],
    body,
    rowPageBreak: 'avoid',
    ...globalTableStylesNoZebra,
    columnStyles: planilhaAnaliticaCadernoColumnStyles(tableLayout.tableWidth),
    didParseCell: (cellData) => {
      if (cellData.section !== 'body') return
      const row = rows[cellData.row.index]
      if (!row || row.tipo === 'grupo') return

      const descricao = row.tipo === 'insumo' || row.tipo === 'item' ? row.descricao : ''
      const isEstimado = row.tipo === 'insumo'
        ? isInsumoRowEstimado(row.estimado, descricao)
        : textoPareceEstimado(descricao)

      if (applyEstimadoCellHighlight(cellData, destacarEstimados, isEstimado)) return

      if (row.tipo === 'insumo') return

      cellData.cell.styles.fillColor = '#e2e8f0'
      cellData.cell.styles.fontStyle = 'bold'
      if (cellData.column.index === 7 && row.classeAbc) {
        cellData.cell.styles.fillColor = ABC_BG[row.classeAbc]
        cellData.cell.styles.textColor = ABC_FG[row.classeAbc]
      }
    },
    willDrawCell: (cellData) => {
      if (cellData.section !== 'body') return
      const row = rows[cellData.row.index]
      if (!row || row.tipo === 'grupo') return
      const descricao = row.tipo === 'insumo' || row.tipo === 'item' ? row.descricao : ''
      const isEstimado = row.tipo === 'insumo'
        ? isInsumoRowEstimado(row.estimado, descricao)
        : textoPareceEstimado(descricao)
      willDrawEstimadoHighlight(cellData, destacarEstimados, isEstimado)
    },
  })
}

// ─── Seção: Lista de Insumos ──────────────────────────────────────────────────

async function drawListaInsumosSection(doc: jsPDF, data: CadernoData, margin: number, contentW: number, pageH: number) {
  const pageW = doc.internal.pageSize.getWidth()
  const headerData = buildStandardHeaderData(data)
  const sectionTitle = 'LISTA DE INSUMOS'
  const headerHooks = standardHeaderAutoTableHooks(doc, headerData, sectionTitle, { skipFirstTablePage: true })

  addLandscapeA4Page(doc)
  let y = drawStandardHeader(doc, headerData, sectionTitle)

  for (const grupo of data.listaInsumos) {
    const headerH = 8
    if (y + headerH + 14 > pageH - margin) {
      addLandscapeA4Page(doc)
      y = drawStandardHeader(doc, headerData, sectionTitle)
    }

    doc.setFillColor(CADERNO_BRAND.secondary)
    doc.rect(margin, y, contentW, headerH, 'F')
    doc.setTextColor('#ffffff')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(CADERNO_FONT.bodySm)
    doc.text(`${grupo.label.toUpperCase()} (${grupo.items.length} itens)`, margin + 2, y + 5.5)

    y += headerH

    y = await drawListaInsumosGrupoTable(doc, pageW, y, grupo.items, {
      headerHooks,
    }) + 4
  }

  if (data.listaInsumos.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(CADERNO_FONT.bodySm)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text('Nenhum insumo cadastrado neste orçamento.', margin, y + 4)
  }
}

// ─── PDF principal ────────────────────────────────────────────────────────────

export interface ExportCadernoOptions {
  /** Default true — colore de âmbar as linhas de insumo estimado na Planilha Analítica (8.0). */
  destacarNaAnalitica?: boolean
  /** Default true — inclui a listagem de serviços com insumo de preço estimado em "(B) Serviços Estimados" (3.0). O total (B) nunca muda — só afeta quais linhas aparecem. */
  incluirServicosComInsumoEstimado?: boolean
  /** IDs (orcamento_estrutura.id) de serviços com insumo estimado a ocultar da listagem — escolha feita no modal "Configurar..." (Relatórios), nunca salva no orçamento. Só tem efeito se incluirServicosComInsumoEstimado !== false. */
  servicosComInsumoEstimadoOcultos?: string[]
}

export async function exportCadernoPdf(data: CadernoData, options: ExportCadernoOptions = {}) {
  const doc = await createLandscapeA4Pdf()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = PDF_PAGE_MARGIN
  const contentW = pdfContentWidth(pageW)
  const headerData = buildStandardHeaderData(data)
  const destacarEstimados = resolveDestacarEstimados(options.destacarNaAnalitica)

  const SEM_DADOS = 'Seção sem dados disponíveis no software'

  function divider(numero: string, titulo: string, sub?: string) {
    addDivider(doc, pageW, pageH, numero, titulo, sub)
  }

  // Capa
  await drawCadernoCoverPage(doc, {
    nomeObra: data.orcamento.nome_obra,
    codigo: data.orcamento.codigo,
    cliente: data.orcamento.cliente,
    numeroRevisao: data.orcamento.numero_revisao,
  }, pageW, pageH)

  // 1.0 Carta de Apresentação (placeholder)
  divider('1.0', 'CARTA DE APRESENTAÇÃO', SEM_DADOS)

  // 2.0 Lista de Projetos (placeholder)
  divider('2.0', 'LISTA DE PROJETOS', SEM_DADOS)

  // 3.0 Resumo Geral do Orçamento — inclui (B) Serviços Estimados, que já
  // reúne tanto itens "- Estimado" quanto serviços com insumo de preço
  // estimado na cotação (ver detectarEstimados em getCadernoData).
  divider('3.0', 'RESUMO GERAL DO ORÇAMENTO', 'Detalhamento dos Custos')
  await drawResumoGeralSection(
    doc, data, margin, contentW, pageH,
    options.incluirServicosComInsumoEstimado ?? true,
    new Set(options.servicosComInsumoEstimadoOcultos ?? []),
  )

  // 4.0 Custo / m²
  divider('4.0', 'CUSTO / M²', 'Áreas e Indicadores de Custo')
  await drawCustoM2Section(doc, data, margin, contentW, pageH)

  // 5.0 Planilha de Preços Unitários
  divider('5.0', 'PLANILHA DE PREÇOS UNITÁRIOS', 'Planilha de Orçamento')
  await drawPlanilhaPrecosSection(doc, data, margin, contentW, destacarEstimados)

  // 6.0 Curva ABC Insumos
  divider('6.0', 'CURVA ABC INSUMOS')
  await drawAbcSection(doc, data.abcInsumos, 'CURVA ABC INSUMOS', margin, contentW, headerData)

  // 7.0 Curva ABC de Serviços
  divider('7.0', 'CURVA ABC DE SERVIÇOS')
  await drawAbcSection(doc, data.abcServicos, 'CURVA ABC DE SERVIÇOS', margin, contentW, headerData)

  // 8.0 Planilha Analítica de Preços Unitários
  divider('8.0', 'PLANILHA ANALÍTICA DE PREÇOS UNITÁRIOS')
  await drawPlanilhaAnaliticaSection(doc, data, margin, contentW, pageH, destacarEstimados)

  // 9.0 Lista de Insumos
  divider('9.0', 'LISTA DE INSUMOS', 'Equipamento, Mão de Obra, Material e Serviço de Terceiros')
  await drawListaInsumosSection(doc, data, margin, contentW, pageH)

  // 10.0 Anexos (placeholder)
  divider('10.0', 'ANEXOS', SEM_DADOS)

  // 11.0 Cotações (placeholder)
  divider('11.0', 'COTAÇÕES', SEM_DADOS)

  // ── Rodapé com numeração de página (a partir da capa) ───────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let p = 2; p <= pageCount; p++) {
    doc.setPage(p)
    const pw = doc.internal.pageSize.getWidth()
    const ph = doc.internal.pageSize.getHeight()
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(CADERNO_FONT.pageFooter)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text(`Página ${p - 1} de ${pageCount - 1}`, pw - margin, ph - 4, { align: 'right' })
  }

  doc.save(`${slugFilename(data.orcamento.nome_obra, 'caderno_orcamento')}_caderno_${new Date().toISOString().split('T')[0]}.pdf`)
}
