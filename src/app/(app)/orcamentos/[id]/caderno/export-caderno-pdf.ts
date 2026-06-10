import type { jsPDF } from 'jspdf'
import type { RowInput } from 'jspdf-autotable'
import { fmt, fmtQtd, fmtPct, type AbcItem } from '@/lib/curva-abc'
import type { CadernoData, CadernoNode } from '@/lib/orcamento/caderno'
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

const GROUP_FILL = '#ede9f3'

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

function addDivider(doc: jsPDF, pageW: number, pageH: number, title: string, subtitle?: string) {
  doc.addPage()
  doc.setFillColor(PDF_COLORS.bannerBg)
  doc.rect(0, 0, pageW, pageH, 'F')
  doc.setFillColor(PDF_COLORS.totalBg)
  doc.rect(0, pageH / 2, pageW, 1, 'F')

  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.text(title, pageW / 2, pageH / 2 - 4, { align: 'center' })

  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(PDF_COLORS.totalSubFg)
    doc.text(subtitle, pageW / 2, pageH / 2 + 8, { align: 'center' })
  }
}

function addSectionBanner(doc: jsPDF, margin: number, contentW: number, title: string, subtitle: string) {
  doc.setFillColor(PDF_COLORS.bannerBg)
  doc.rect(margin, margin, contentW, 16, 'F')
  doc.setTextColor(PDF_COLORS.bannerFg)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(title, margin + 4, margin + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(subtitle, margin + 4, margin + 12.5)
}

// ─── Seção: Planilha de Preços Unitários ─────────────────────────────────────

function flattenArvore(nodes: CadernoNode[], depth = 0, out: { node: CadernoNode; depth: number }[] = []) {
  for (const n of nodes) {
    out.push({ node: n, depth })
    flattenArvore(n.filhos, depth + 1, out)
  }
  return out
}

async function drawPlanilhaPrecosSection(doc: jsPDF, data: CadernoData, margin: number, contentW: number, subtitle: string) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage()
  addSectionBanner(doc, margin, contentW, 'PLANILHA DE PREÇOS UNITÁRIOS', subtitle)

  const flat = flattenArvore(data.arvore)
  const body: RowInput[] = flat.map(({ node, depth }) => {
    const indent = '   '.repeat(depth)
    if (node.tipo === 'grupo') {
      return [node.numero, node.codigo ?? '', indent + node.descricao, '', '', '', '', '', '', fmt(node.total), fmtPct(node.percentual)]
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
    ]
  })

  autoTable(doc, {
    startY: margin + 20,
    margin: { left: margin, right: margin, bottom: margin },
    head: [['Item', 'Cód.', 'Descrição', 'Und', 'Qtd', 'Mat/Equip (R$)', 'M.O. (R$)', 'Terceiros (R$)', 'Preço Unit. (R$)', 'Total (R$)', '%']],
    body,
    foot: [['', '', 'TOTAL GERAL', '', '', '', '', '', '', fmt(data.totalGeral), '100,00%']],
    showFoot: 'lastPage',
    styles: { fontSize: 6.5, cellPadding: 1, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
    headStyles: { fillColor: PDF_COLORS.bannerBg, textColor: '#ffffff', fontStyle: 'bold', halign: 'center', fontSize: 7 },
    footStyles: { fillColor: '#f1f5f9', textColor: '#1e293b', fontStyle: 'bold', lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 18 },
      2: { cellWidth: 85 },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 24, halign: 'right' },
      8: { cellWidth: 24, halign: 'right' },
      9: { cellWidth: 26, halign: 'right' },
      10: { cellWidth: 12, halign: 'right' },
    },
    didParseCell: (cellData) => {
      if (cellData.section !== 'body') return
      const { node } = flat[cellData.row.index]
      if (node.tipo === 'grupo') {
        cellData.cell.styles.fillColor = GROUP_FILL
        cellData.cell.styles.fontStyle = 'bold'
      }
    },
  })
}

// ─── Seção: Curva ABC ─────────────────────────────────────────────────────────

async function drawAbcSection(doc: jsPDF, items: AbcItem[], title: string, margin: number, contentW: number, subtitle: string) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage()
  addSectionBanner(doc, margin, contentW, title, subtitle)

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

async function drawPlanilhaAnaliticaSection(doc: jsPDF, data: CadernoData, margin: number, contentW: number, pageH: number, subtitle: string) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage()
  addSectionBanner(doc, margin, contentW, 'PLANILHA ANALÍTICA DE PREÇOS UNITÁRIOS', subtitle)

  let y = margin + 16 + 6

  for (const comp of data.composicoesAnaliticas) {
    const headerH = 8
    const estimatedRows = comp.insumos.length + 2
    if (y + headerH + estimatedRows * 5 > pageH - margin && y > margin + 30) {
      doc.addPage()
      y = margin
    }

    doc.setFillColor(PDF_COLORS.totalBg)
    doc.rect(margin, y, contentW, headerH, 'F')
    doc.setTextColor('#ffffff')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(`${comp.codigo} — ${comp.descricao}`, margin + 2, y + 5.5)
    doc.setFont('helvetica', 'normal')
    doc.text(`Und: ${comp.unidade}    Custo Unit.: ${fmt(comp.custoUnitario)}`, margin + contentW - 2, y + 5.5, { align: 'right' })

    y += headerH

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: margin },
      head: [['Código', 'Descrição', 'Und', 'Índice', 'R$ Unit.', 'R$ Total']],
      body: comp.insumos.map(ins => [
        ins.codigo,
        ins.descricao,
        ins.unidade,
        ins.indice.toLocaleString('pt-BR', { maximumFractionDigits: 6 }),
        fmt(ins.custoUnit),
        fmt(ins.custoTotal),
      ]),
      styles: { fontSize: 6.5, cellPadding: 1, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
      headStyles: { fillColor: '#e9d5ff', textColor: '#4c1d4f', fontStyle: 'bold', halign: 'center', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 140 },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 35, halign: 'right' },
        5: { cellWidth: 40, halign: 'right' },
      },
    })

    // @ts-expect-error lastAutoTable é injetado em runtime pelo plugin jspdf-autotable
    y = doc.lastAutoTable.finalY + 4
  }

  if (data.composicoesAnaliticas.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text('Nenhuma composição com insumos cadastrados neste orçamento.', margin, y + 4)
  }
}

// ─── Seção: Lista de Insumos ──────────────────────────────────────────────────

async function drawListaInsumosSection(doc: jsPDF, data: CadernoData, margin: number, contentW: number, pageH: number, subtitle: string) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage()
  addSectionBanner(doc, margin, contentW, 'LISTA DE INSUMOS', subtitle)

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

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: margin },
      head: [['Código', 'Descrição', 'Und', 'Custo (R$)']],
      body: grupo.items.map(i => [i.codigo, i.descricao, i.unidade, fmt(i.custo)]),
      styles: { fontSize: 7, cellPadding: 1.2, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
      headStyles: { fillColor: '#e9d5ff', textColor: '#4c1d4f', fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 180 },
        2: { cellWidth: 27, halign: 'center' },
        3: { cellWidth: 40, halign: 'right' },
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

  const dividerPages = new Set<number>()
  function divider(title: string, sub?: string) {
    addDivider(doc, pageW, pageH, title, sub)
    dividerPages.add(doc.getNumberOfPages())
  }

  // 1. Capa
  addCoverPage(doc, data, pageW, pageH)

  // 2. Planilha de Preços Unitários / Planilha de Orçamento
  divider('PLANILHA DE PREÇOS UNITÁRIOS', 'Planilha de Orçamento')
  await drawPlanilhaPrecosSection(doc, data, margin, contentW, subtitle)

  // 3. Curva ABC de Insumos
  divider('CURVA ABC', 'Insumos')
  await drawAbcSection(doc, data.abcInsumos, 'CURVA ABC — INSUMOS', margin, contentW, subtitle)

  // 4. Curva ABC de Serviços
  divider('CURVA ABC', 'Serviços')
  await drawAbcSection(doc, data.abcServicos, 'CURVA ABC — SERVIÇOS', margin, contentW, subtitle)

  // 5. Planilha Analítica de Preços Unitários
  divider('PLANILHA ANALÍTICA', 'de Preços Unitários')
  await drawPlanilhaAnaliticaSection(doc, data, margin, contentW, pageH, subtitle)

  // 6. Lista de Insumos
  divider('LISTA DE INSUMOS', 'Equipamento, Mão de Obra, Material e Serviço de Terceiros')
  await drawListaInsumosSection(doc, data, margin, contentW, pageH, subtitle)

  // 7. Anexos (placeholder)
  divider('ANEXOS', 'Seção sem dados disponíveis no software')

  // 8. Cotações (placeholder)
  divider('COTAÇÕES', 'Seção sem dados disponíveis no software')

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
