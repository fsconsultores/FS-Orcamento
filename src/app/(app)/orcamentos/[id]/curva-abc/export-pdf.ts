import type { AbcItem } from '@/lib/curva-abc'
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

// ─── PDF principal ────────────────────────────────────────────────────────────

const TAB_TITLES: Record<string, string> = {
  geral: 'GERAL',
  materiais: 'MATERIAIS',
  mao_de_obra: 'MÃO DE OBRA',
  equipamentos: 'EQUIPAMENTOS',
  servicos: 'SERVIÇOS',
  insumos: 'INSUMOS', // usado pelas abas legadas de Relatórios (abcServicos/abcInsumos)
}

export async function exportCurvaAbcPdf(
  items: AbcItem[],
  tab: 'geral' | 'materiais' | 'mao_de_obra' | 'equipamentos' | 'servicos' | 'insumos',
  orcamentoNome?: string,
) {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 10
  const contentW = pageW - margin * 2

  // ── Banner ──────────────────────────────────────────────────────────────────
  doc.setFillColor(PDF_COLORS.bannerBg)
  doc.rect(margin, margin, contentW, 16, 'F')
  doc.setTextColor(PDF_COLORS.bannerFg)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(`CURVA ABC — ${TAB_TITLES[tab] ?? tab.toUpperCase()}`, margin + 4, margin + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const subtitle = [orcamentoNome, `Gerado em ${new Date().toLocaleDateString('pt-BR')}`]
    .filter(Boolean)
    .join('   •   ')
  doc.text(subtitle, margin + 4, margin + 12.5)

  // ── KPI cards ───────────────────────────────────────────────────────────────
  const cardY = margin + 16 + 4
  const cardH = drawAbcKpiCards(doc, items, margin, cardY, contentW)

  // ── Gráfico ─────────────────────────────────────────────────────────────────
  const chartTitleY = cardY + cardH + 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor('#374151')
  doc.text('Curva ABC Acumulada', margin, chartTitleY)

  const chartY = chartTitleY + 2
  const chartH = 58
  drawAbcChart(doc, items, margin, chartY, contentW, chartH)

  // ── Tabela ──────────────────────────────────────────────────────────────────
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
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const classe = (data.row.raw as string[])[9]
      data.cell.styles.fillColor = abcRowFillColor(classe)
      if (data.column.index === 9) {
        data.cell.styles.textColor = abcRowTextColor(classe)
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.halign = 'center'
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'foot' && data.column.index === 6) {
        data.cell.styles.halign = 'right'
      }
    },
  })

  // ── Rodapé com numeração de página ─────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text(`Página ${p} de ${pageCount}`, pageW - margin, pageH - 4, { align: 'right' })
  }

  doc.save(`curva_abc_${tab}_${new Date().toISOString().split('T')[0]}.pdf`)
}
