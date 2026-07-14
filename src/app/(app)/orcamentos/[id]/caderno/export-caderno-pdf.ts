import type { jsPDF } from 'jspdf'
import type { RowInput } from 'jspdf-autotable'
import { fmt, fmtQtd, fmtPct, type AbcItem } from '@/lib/curva-abc'
import type { CadernoData, CadernoNode, AbcClasse } from '@/lib/orcamento/caderno'
import {
  PDF_COLORS,
  drawAbcChart,
  drawAbcKpiCards,
  abcTableHead,
  abcTableBody,
  abcTableFoot,
  abcTableColumnStyles,
  abcRowFillColor,
  abcRowTextColor,
} from '@/lib/pdf/abc-section'
import {
  KPI_STYLE_NEUTRAL,
  KPI_STYLE_PRIMARY,
  drawDonutChart,
  drawDonutLegend,
  drawKpiCard,
  type DonutSegment,
} from '@/lib/pdf/charts'

const GROUP_FILL = '#ede9f3'

// Classe ABC por item — mesmo mapeamento canônico da Curva ABC (ver
// src/components/ui/badge.tsx): A = verde (maior prioridade de acompanhamento,
// concentra ~80% do custo), C = vermelho. Estava invertido aqui (bug real,
// corrigido durante a reformulação de UI/UX).
const ABC_BG: Record<AbcClasse, string> = { A: '#dcfce7', B: '#fef3c7', C: '#fee2e2' }
const ABC_FG: Record<AbcClasse, string> = { A: '#15803d', B: '#b45309', C: '#b91c1c' }

// ─── Cabeçalho de documento (logo + cliente + obra + título + REV + data) ────

function drawDocumentHeader(
  doc: jsPDF,
  data: CadernoData,
  margin: number,
  contentW: number,
  titulo: string,
) {
  const HEADER_H = 24
  const LEFT_W   = 62
  const RIGHT_W  = 52
  const CTR_W    = contentW - LEFT_W - RIGHT_W
  const lx = margin
  const cx = margin + LEFT_W
  const rx = cx + CTR_W
  const ty = margin

  const { nome_obra, cliente } = data.orcamento
  const dateStr = new Date().toLocaleDateString('pt-BR')

  // Fundo único
  doc.setFillColor(PDF_COLORS.bannerBg)
  doc.rect(lx, ty, contentW, HEADER_H, 'F')

  // Divisórias internas (linha fina branca)
  doc.setDrawColor('#ffffff')
  doc.setLineWidth(0.15)
  doc.line(cx, ty + 2, cx, ty + HEADER_H - 2)
  doc.line(rx, ty + 2, rx, ty + HEADER_H - 2)

  // Borda externa
  doc.setDrawColor('#0f172a')
  doc.setLineWidth(0.3)
  doc.rect(lx, ty, contentW, HEADER_H)

  // Logo
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor('#ffffff')
  doc.text('FS CONSULTORES', lx + 2, ty + 8)

  // Esquerda: cliente / obra
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor('#cbd5e1')
  doc.text(doc.splitTextToSize(`Cliente: ${cliente || '—'}`, LEFT_W - 4)[0], lx + 2, ty + 15)
  doc.text(doc.splitTextToSize(`Obra: ${nome_obra || '—'}`, LEFT_W - 4)[0], lx + 2, ty + 20)

  // Centro: título
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor('#ffffff')
  doc.text(titulo, cx + CTR_W / 2, ty + HEADER_H / 2 + 2, { align: 'center' })

  // Direita: REV / Data
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor('#ffffff')
  doc.text('REV 00', rx + RIGHT_W - 2, ty + 10, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor('#94a3b8')
  doc.text(`Data: ${dateStr}`, rx + RIGHT_W - 2, ty + 17, { align: 'right' })
}

// ─── Helpers de layout ────────────────────────────────────────────────────────

function addCoverPage(doc: jsPDF, data: CadernoData, pageW: number, pageH: number) {
  doc.setFillColor(PDF_COLORS.bannerBg)
  doc.rect(0, 0, pageW, pageH, 'F')

  doc.setFillColor(PDF_COLORS.totalBg)
  doc.rect(0, pageH / 2, pageW, 1.2, 'F')

  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(30)
  doc.text('CADERNO DE ORÇAMENTO', pageW / 2, pageH / 2 - 22, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(16)
  const { nome_obra, codigo, cliente } = data.orcamento
  doc.text(nome_obra || '—', pageW / 2, pageH / 2 - 6, { align: 'center' })

  doc.setFontSize(11)
  doc.setTextColor(PDF_COLORS.totalSubFg)
  const linha2 = [codigo ? `Cód. ${codigo}` : null, cliente].filter(Boolean).join('   •   ')
  if (linha2) doc.text(linha2, pageW / 2, pageH / 2 + 4, { align: 'center' })

  doc.setFontSize(9)
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, pageH - 14, { align: 'center' })
}

function addDivider(doc: jsPDF, pageW: number, pageH: number, numero: string, titulo: string, subtitle?: string) {
  doc.addPage()
  doc.setFillColor(PDF_COLORS.bannerBg)
  doc.rect(0, 0, pageW, pageH, 'F')
  doc.setFillColor(PDF_COLORS.totalBg)
  doc.rect(0, pageH / 2, pageW, 1, 'F')

  doc.setTextColor(PDF_COLORS.totalSubFg)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(numero, pageW / 2, pageH / 2 - 14, { align: 'center' })

  doc.setTextColor('#ffffff')
  doc.setFontSize(22)
  doc.text(titulo, pageW / 2, pageH / 2 - 2, { align: 'center' })

  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(PDF_COLORS.totalSubFg)
    doc.text(subtitle, pageW / 2, pageH / 2 + 10, { align: 'center' })
  }
}

function addSectionBanner(doc: jsPDF, margin: number, contentW: number, numero: string, title: string, subtitle: string) {
  doc.setFillColor(PDF_COLORS.bannerBg)
  doc.rect(margin, margin, contentW, 16, 'F')
  doc.setTextColor(PDF_COLORS.bannerFg)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(`${numero}  ${title}`, margin + 4, margin + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(subtitle, margin + 4, margin + 12.5)
}

// ─── Seção: Resumo Geral do Orçamento ────────────────────────────────────────

async function drawResumoGeralSection(doc: jsPDF, data: CadernoData, margin: number, contentW: number, subtitle: string, numero: string) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage()
  addSectionBanner(doc, margin, contentW, numero, 'RESUMO GERAL DO ORÇAMENTO', subtitle)

  const top = margin + 16 + 8
  const leftW = 120
  const gap = 4
  const rightX = margin + leftW + gap
  const rightW = contentW - leftW - gap

  const A = data.totalGeral
  const B = data.totalServicosEstimados
  const C = A + B
  const { area_total, area_coberta, area_equivalente } = data.orcamento

  // ── Coluna esquerda: (A) Total Orçado ─────────────────────────────────────
  let yLeft = top
  doc.setFillColor(PDF_COLORS.totalBg)
  doc.rect(margin, yLeft, leftW, 8, 'F')
  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('(A) TOTAL ORÇADO', margin + 3, yLeft + 5.5)
  doc.text(fmt(A), margin + leftW - 3, yLeft + 5.5, { align: 'right' })
  yLeft += 8

  autoTable(doc, {
    startY: yLeft,
    margin: { left: margin, right: margin + contentW - leftW, bottom: margin },
    head: [['Descrição', 'Valor Geral (R$)', '% / Total']],
    body: data.arvore.map(n => [n.descricao, fmt(n.total), fmtPct(n.percentual)]),
    foot: [['TOTAL GERAL', fmt(A), '100,00%']],
    showFoot: 'lastPage',
    styles: { fontSize: 6.5, cellPadding: 1, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
    headStyles: { fillColor: PDF_COLORS.bannerBg, textColor: '#ffffff', fontStyle: 'bold', halign: 'center', fontSize: 7 },
    footStyles: { fillColor: '#f1f5f9', textColor: '#1e293b', fontStyle: 'bold', lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: leftW - 50 },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 20, halign: 'right' },
    },
  })

  // @ts-expect-error lastAutoTable é injetado em runtime pelo plugin jspdf-autotable
  yLeft = doc.lastAutoTable.finalY + 6

  // ── Coluna esquerda: (B) Serviços Estimados ───────────────────────────────
  doc.setFillColor(PDF_COLORS.totalBg)
  doc.rect(margin, yLeft, leftW, 8, 'F')
  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('(B) SERVIÇOS ESTIMADOS', margin + 3, yLeft + 5.5)
  doc.text(fmt(B), margin + leftW - 3, yLeft + 5.5, { align: 'right' })
  yLeft += 8

  if (data.servicosEstimados.length > 0) {
    autoTable(doc, {
      startY: yLeft,
      margin: { left: margin, right: margin + contentW - leftW, bottom: margin },
      head: [['Descrição', 'Valor Geral (R$)', '% / Total']],
      body: data.servicosEstimados.map(s => [s.descricao, fmt(s.valor), fmtPct(B > 0 ? (s.valor / B) * 100 : 0)]),
      foot: [['TOTAL', fmt(B), '100,00%']],
      showFoot: 'lastPage',
      styles: { fontSize: 6.5, cellPadding: 1, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
      headStyles: { fillColor: PDF_COLORS.bannerBg, textColor: '#ffffff', fontStyle: 'bold', halign: 'center', fontSize: 7 },
      footStyles: { fillColor: '#f1f5f9', textColor: '#1e293b', fontStyle: 'bold', lineWidth: 0.1 },
      columnStyles: {
        0: { cellWidth: leftW - 50 },
        1: { cellWidth: 30, halign: 'right' },
        2: { cellWidth: 20, halign: 'right' },
      },
    })
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text('Nenhum serviço estimado cadastrado.', margin + 3, yLeft + 5)
  }

  // ── Coluna direita: KPI cards ──────────────────────────────────────────────
  const cardGap = 3
  const cardW = (rightW - cardGap * 2) / 3
  const cardH = 18

  drawKpiCard(doc, rightX, top, cardW, cardH, 'TOTAL GERAL (C) = (A+B)', fmt(C), undefined, KPI_STYLE_PRIMARY)
  drawKpiCard(doc, rightX + (cardW + cardGap), top, cardW, cardH, 'TOTAL ORÇADO (A)', fmt(A), undefined, KPI_STYLE_PRIMARY)
  drawKpiCard(doc, rightX + (cardW + cardGap) * 2, top, cardW, cardH, 'SERVIÇOS ESTIMADOS (B)', fmt(B), undefined, KPI_STYLE_PRIMARY)

  const row2Y = top + cardH + cardGap
  drawKpiCard(doc, rightX, row2Y, cardW, cardH, 'CUSTO/M² (ÁREA TOTAL)',
    area_total ? fmt(C / area_total) : '—',
    area_total ? `Área: ${fmtQtd(area_total)} m²` : 'Área não informada', KPI_STYLE_NEUTRAL)
  drawKpiCard(doc, rightX + (cardW + cardGap), row2Y, cardW, cardH, 'CUSTO/M² (ÁREAS COBERTAS)',
    area_coberta ? fmt(C / area_coberta) : '—',
    area_coberta ? `Área: ${fmtQtd(area_coberta)} m²` : 'Área não informada', KPI_STYLE_NEUTRAL)
  drawKpiCard(doc, rightX + (cardW + cardGap) * 2, row2Y, cardW, cardH, 'CUSTO/M² (ÁREA EQUIVALENTE)',
    area_equivalente ? fmt(C / area_equivalente) : '—',
    area_equivalente ? `Área: ${fmtQtd(area_equivalente)} m²` : 'Área não informada', KPI_STYLE_NEUTRAL)

  // ── Coluna direita: distribuição dos custos (gráfico de rosca) ────────────
  const donutTop = row2Y + cardH + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor('#374151')
  doc.text('DISTRIBUIÇÃO DOS CUSTOS (A)', rightX, donutTop)

  const segments: DonutSegment[] = data.distribuicaoCustos.map(d => ({
    label: d.numero ? `${d.numero} ${d.label}` : d.label,
    value: d.value,
    color: d.color,
  }))

  const outerR = 32
  const cx = rightX + outerR + 4
  const cy = donutTop + 6 + outerR
  drawDonutChart(doc, segments, cx, cy, outerR)

  const legendX = cx + outerR + 6
  const legendW = rightX + rightW - legendX
  const lineH = 4
  const maxRowsPerCol = Math.max(1, Math.floor((outerR * 2) / lineH))
  const numCols = Math.max(1, Math.ceil(segments.length / maxRowsPerCol))
  const colW = legendW / numCols
  drawDonutLegend(doc, segments, legendX, cy - outerR + lineH, lineH, 6, colW, maxRowsPerCol)
}

// ─── Seção: Custo / m² ────────────────────────────────────────────────────────

async function drawCustoM2Section(doc: jsPDF, data: CadernoData, margin: number, contentW: number, subtitle: string, numero: string) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage()
  addSectionBanner(doc, margin, contentW, numero, 'CUSTO / M²', subtitle)

  const { nome_obra, cliente, local, area_total, area_coberta, area_equivalente } = data.orcamento
  const A = data.totalGeral
  const B = data.totalServicosEstimados
  const C = A + B

  // ── Identificação (Cliente / Obra / Local) ────────────────────────────────
  let y = margin + 16 + 8
  const infoLines: [string, string][] = [
    ['CLIENTE', cliente || '—'],
    ['OBRA', nome_obra || '—'],
  ]
  if (local) infoLines.push(['LOCAL', local])
  doc.setFontSize(9)
  for (const [label, value] of infoLines) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#374151')
    doc.text(`${label}:`, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor('#1f2937')
    doc.text(value, margin + 22, y)
    y += 6
  }

  // ── Tabela de áreas ─────────────────────────────────────────────────────────
  y += 4
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['PAVIMENTO', 'UN', 'ÁREA TOTAL', 'ÁREA EQUIVALENTE', 'ÁREAS COBERTAS']],
    body: [[
      'ÁREA TOTAL:',
      'M²',
      area_total != null ? fmtQtd(area_total) : '—',
      area_equivalente != null ? fmtQtd(area_equivalente) : '—',
      area_coberta != null ? fmtQtd(area_coberta) : '—',
    ]],
    styles: { fontSize: 9, cellPadding: 2.5, valign: 'middle', halign: 'right', lineColor: '#cbd5e1', lineWidth: 0.1 },
    headStyles: { fillColor: PDF_COLORS.bannerBg, textColor: '#ffffff', fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fillColor: GROUP_FILL, textColor: PDF_COLORS.bannerBg, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'center' },
    },
  })

  // @ts-expect-error lastAutoTable é injetado em runtime pelo plugin jspdf-autotable
  y = doc.lastAutoTable.finalY + 6

  // ── Faixas: custo total e custo/m² ────────────────────────────────────────
  const rowH = 11
  function row(label: string, value: string, bg: string) {
    doc.setFillColor(bg)
    doc.rect(margin, y, contentW, rowH, 'F')
    doc.setTextColor('#ffffff')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(label, margin + 4, y + rowH / 2 + 1.5)
    doc.text(value, margin + contentW - 4, y + rowH / 2 + 1.5, { align: 'right' })
    y += rowH + 2
  }

  row('CUSTO TOTAL DO ORÇAMENTO', fmt(C), PDF_COLORS.bannerBg)
  row('CUSTO / M² (ÁREA TOTAL)', area_total ? fmt(C / area_total) : '—', PDF_COLORS.totalBg)
  row('CUSTO / M² (ÁREA EQUIVALENTE)', area_equivalente ? fmt(C / area_equivalente) : '—', PDF_COLORS.totalBg)
  row('CUSTO / M² (ÁREAS COBERTAS)', area_coberta ? fmt(C / area_coberta) : '—', PDF_COLORS.totalBg)
}

// ─── Seção: Planilha de Preços Unitários ─────────────────────────────────────

function flattenArvore(nodes: CadernoNode[], depth = 0, out: { node: CadernoNode; depth: number }[] = []) {
  for (const n of nodes) {
    out.push({ node: n, depth })
    flattenArvore(n.filhos, depth + 1, out)
  }
  return out
}

async function drawPlanilhaPrecosSection(doc: jsPDF, data: CadernoData, margin: number, contentW: number, subtitle: string, numero: string) {
  const { autoTable } = await import('jspdf-autotable')

  const HEADER_H = 24
  const tableTop = margin + HEADER_H + 4

  doc.addPage()

  const flat = flattenArvore(data.arvore)
  const body: RowInput[] = flat.map(({ node, depth }) => {
    const indent = '   '.repeat(depth)
    if (node.tipo === 'grupo') {
      return [node.numero, node.codigo ?? '', indent + node.descricao, '', '', '', '', '', '', fmt(node.total), fmtPct(node.percentual), '']
    }
    return [
      node.numero,
      node.codigo ?? '',
      indent + node.descricao,
      node.unidade ?? '',
      fmtQtd(node.quantidade ?? 0),
      fmt(node.custoMat),
      fmt(node.custoMo),
      fmt(node.custoTerceiros),
      fmt(node.custoUnitario),
      fmt(node.total),
      fmtPct(node.percentual),
      node.classeAbc ?? '',
    ]
  })

  autoTable(doc, {
    startY: tableTop,
    willDrawPage: () => { drawDocumentHeader(doc, data, margin, contentW, 'PLANILHA DE PREÇOS UNITÁRIOS') },
    margin: { left: margin, right: margin, bottom: margin, top: tableTop },
    head: [['Item', 'Cód.', 'Descrição', 'Und', 'Qtd', 'Mat/Equip (R$)', 'M.O. (R$)', 'Terceiros (R$)', 'Preço Unit. (R$)', 'Total (R$)', '%', 'ABC']],
    body,
    foot: [['', '', 'TOTAL GERAL', '', '', '', '', '', '', fmt(data.totalGeral), '100,00%', '']],
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    styles: { fontSize: 6.5, cellPadding: 1, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
    headStyles: { fillColor: PDF_COLORS.bannerBg, textColor: '#ffffff', fontStyle: 'bold', halign: 'center', fontSize: 7 },
    footStyles: { fillColor: '#f1f5f9', textColor: '#1e293b', fontStyle: 'bold', lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 18 },
      2: { cellWidth: 69 },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 24, halign: 'right' },
      8: { cellWidth: 24, halign: 'right' },
      9: { cellWidth: 26, halign: 'right' },
      10: { cellWidth: 12, halign: 'right' },
      11: { cellWidth: 10, halign: 'center' },
    },
    didParseCell: (cellData) => {
      if (cellData.section !== 'body') return
      const { node } = flat[cellData.row.index]
      if (node.tipo === 'grupo') {
        cellData.cell.styles.fillColor = GROUP_FILL
        cellData.cell.styles.fontStyle = 'bold'
        return
      }
      if (cellData.column.index === 11 && node.classeAbc) {
        cellData.cell.styles.fillColor = ABC_BG[node.classeAbc]
        cellData.cell.styles.textColor = ABC_FG[node.classeAbc]
        cellData.cell.styles.fontStyle = 'bold'
      }
    },
  })
}

// ─── Seção: Curva ABC ─────────────────────────────────────────────────────────

async function drawAbcSection(doc: jsPDF, items: AbcItem[], numero: string, title: string, margin: number, contentW: number, subtitle: string) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage()
  addSectionBanner(doc, margin, contentW, numero, title, subtitle)

  const cardY = margin + 16 + 4
  const cardH = drawAbcKpiCards(doc, items, margin, cardY, contentW)

  const chartTitleY = cardY + cardH + 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor('#374151')
  doc.text('Curva ABC Acumulada', margin, chartTitleY)

  const chartY = chartTitleY + 2
  const chartH = 58
  drawAbcChart(doc, items, margin, chartY, contentW, chartH)

  const tableStartY = chartY + chartH + 6
  autoTable(doc, {
    startY: tableStartY,
    margin: { left: margin, right: margin, bottom: margin },
    head: abcTableHead(),
    body: abcTableBody(items),
    foot: abcTableFoot(items),
    showFoot: 'lastPage',
    styles: { fontSize: 7, cellPadding: 1.2, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
    headStyles: { fillColor: PDF_COLORS.bannerBg, textColor: '#ffffff', fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: '#f1f5f9', textColor: '#1e293b', fontStyle: 'bold', lineWidth: 0.1 },
    columnStyles: abcTableColumnStyles,
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

async function drawPlanilhaAnaliticaSection(doc: jsPDF, data: CadernoData, margin: number, contentW: number, subtitle: string, numero: string) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage()
  addSectionBanner(doc, margin, contentW, numero, 'PLANILHA ANALÍTICA DE PREÇOS UNITÁRIOS', subtitle)

  const rows = data.planilhaAnalitica

  if (rows.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text('Nenhum item com composição detalhada neste orçamento.', margin, margin + 16 + 10)
    return
  }

  const body: RowInput[] = rows.map(row => {
    if (row.tipo === 'grupo') {
      return [{
        content: `${row.numero}   ${row.descricao}`,
        colSpan: 8,
        styles: { fillColor: PDF_COLORS.bannerBg, textColor: '#ffffff', fontStyle: 'bold', halign: 'left' },
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
    startY: margin + 16 + 4,
    margin: { left: margin, right: margin, bottom: margin },
    head: [['Item', 'Código', 'Descrição', 'Und', 'Índice', 'R$ Unit.', 'R$ Total', 'ABC']],
    body,
    rowPageBreak: 'avoid',
    styles: { fontSize: 6.5, cellPadding: 1, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
    headStyles: { fillColor: PDF_COLORS.bannerBg, textColor: '#ffffff', fontStyle: 'bold', halign: 'center', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 20 },
      2: { cellWidth: 121 },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 35, halign: 'right' },
      6: { cellWidth: 35, halign: 'right' },
      7: { cellWidth: 10, halign: 'center' },
    },
    didParseCell: (cellData) => {
      if (cellData.section !== 'body') return
      const row = rows[cellData.row.index]
      if (row.tipo !== 'item') return
      cellData.cell.styles.fillColor = '#e9d5ff'
      cellData.cell.styles.fontStyle = 'bold'
      if (cellData.column.index === 7 && row.classeAbc) {
        cellData.cell.styles.fillColor = ABC_BG[row.classeAbc]
        cellData.cell.styles.textColor = ABC_FG[row.classeAbc]
      }
    },
  })
}

// ─── Seção: Lista de Insumos ──────────────────────────────────────────────────

async function drawListaInsumosSection(doc: jsPDF, data: CadernoData, margin: number, contentW: number, pageH: number, subtitle: string, numero: string) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage()
  addSectionBanner(doc, margin, contentW, numero, 'LISTA DE INSUMOS', subtitle)

  let y = margin + 16 + 6

  for (const grupo of data.listaInsumos) {
    const headerH = 8
    if (y + headerH + 10 > pageH - margin && y > margin + 30) {
      doc.addPage()
      y = margin
    }

    doc.setFillColor(PDF_COLORS.totalBg)
    doc.rect(margin, y, contentW, headerH, 'F')
    doc.setTextColor('#ffffff')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(`${grupo.label.toUpperCase()} (${grupo.items.length} itens)`, margin + 2, y + 5.5)

    y += headerH

    const totalGrupo = grupo.items.reduce((s, i) => s + i.total, 0)

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: margin },
      head: [['Grupo', 'Código', 'Descrição', 'Und', 'Quantidade', 'Preço (R$)', 'Total (R$)']],
      body: grupo.items.map(i => [i.grupo, i.codigo, i.descricao, i.unidade, fmtQtd(i.quantidade), fmt(i.custo), fmt(i.total)]),
      foot: [['', '', '', '', '', 'TOTAL DO GRUPO', fmt(totalGrupo)]],
      showFoot: 'lastPage',
      styles: { fontSize: 7, cellPadding: 1.2, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
      headStyles: { fillColor: '#e9d5ff', textColor: '#4c1d4f', fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: '#f1f5f9', textColor: '#1e293b', fontStyle: 'bold', halign: 'right', lineWidth: 0.1 },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 24 },
        2: { cellWidth: 119 },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 28, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
        6: { cellWidth: 30, halign: 'right' },
      },
    })

    // @ts-expect-error lastAutoTable é injetado em runtime pelo plugin jspdf-autotable
    y = doc.lastAutoTable.finalY + 4
  }

  if (data.listaInsumos.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text('Nenhum insumo cadastrado neste orçamento.', margin, y + 4)
  }
}

// ─── PDF principal ────────────────────────────────────────────────────────────

export async function exportCadernoPdf(data: CadernoData) {
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 10
  const contentW = pageW - margin * 2

  const subtitle = [
    [data.orcamento.codigo, data.orcamento.nome_obra].filter(Boolean).join(' - '),
    `Gerado em ${new Date().toLocaleDateString('pt-BR')}`,
  ].filter(Boolean).join('   •   ')

  const SEM_DADOS = 'Seção sem dados disponíveis no software'

  const dividerPages = new Set<number>()
  function divider(numero: string, titulo: string, sub?: string) {
    addDivider(doc, pageW, pageH, numero, titulo, sub)
    dividerPages.add(doc.getNumberOfPages())
  }

  // Capa
  addCoverPage(doc, data, pageW, pageH)

  // 1.0 Carta de Apresentação (placeholder)
  divider('1.0', 'CARTA DE APRESENTAÇÃO', SEM_DADOS)

  // 2.0 Lista de Projetos (placeholder)
  divider('2.0', 'LISTA DE PROJETOS', SEM_DADOS)

  // 3.0 Resumo Geral do Orçamento
  divider('3.0', 'RESUMO GERAL DO ORÇAMENTO', 'Detalhamento dos Custos')
  await drawResumoGeralSection(doc, data, margin, contentW, subtitle, '3.0')

  // 4.0 Custo / m²
  divider('4.0', 'CUSTO / M²', 'Áreas e Indicadores de Custo')
  await drawCustoM2Section(doc, data, margin, contentW, subtitle, '4.0')

  // 5.0 Planilha de Preços Unitários
  divider('5.0', 'PLANILHA DE PREÇOS UNITÁRIOS', 'Planilha de Orçamento')
  await drawPlanilhaPrecosSection(doc, data, margin, contentW, subtitle, '5.0')

  // 6.0 Curva ABC Insumos
  divider('6.0', 'CURVA ABC INSUMOS')
  await drawAbcSection(doc, data.abcInsumos, '6.0', 'CURVA ABC INSUMOS', margin, contentW, subtitle)

  // 7.0 Curva ABC de Serviços
  divider('7.0', 'CURVA ABC DE SERVIÇOS')
  await drawAbcSection(doc, data.abcServicos, '7.0', 'CURVA ABC DE SERVIÇOS', margin, contentW, subtitle)

  // 8.0 Planilha Analítica de Preços Unitários
  divider('8.0', 'PLANILHA ANALÍTICA DE PREÇOS UNITÁRIOS')
  await drawPlanilhaAnaliticaSection(doc, data, margin, contentW, subtitle, '8.0')

  // 9.0 Lista de Insumos
  divider('9.0', 'LISTA DE INSUMOS', 'Equipamento, Mão de Obra, Material e Serviço de Terceiros')
  await drawListaInsumosSection(doc, data, margin, contentW, pageH, subtitle, '9.0')

  // 10.0 Anexos (placeholder)
  divider('10.0', 'ANEXOS', SEM_DADOS)

  // 11.0 Cotações (placeholder)
  divider('11.0', 'COTAÇÕES', SEM_DADOS)

  // ── Rodapé com numeração de página (a partir da capa) ───────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let p = 2; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(dividerPages.has(p) ? PDF_COLORS.totalSubFg : PDF_COLORS.textGray)
    doc.text(`Página ${p - 1} de ${pageCount - 1}`, pageW - margin, pageH - 4, { align: 'right' })
  }

  doc.save(`caderno_orcamento_${new Date().toISOString().split('T')[0]}.pdf`)
}
