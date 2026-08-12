import type { RowInput } from 'jspdf-autotable'
import type { CadernoData, CadernoNode } from '@/lib/orcamento/caderno'
import { fmt, fmtQtd } from '@/lib/curva-abc'
import { PDF_COLORS } from '@/lib/pdf/abc-section'
import { slugFilename } from './xlsx-shared'
import { formatDate } from '@/lib/format-date'

const GROUP_FILL = '#f1f5f9'

function flattenArvore(nodes: CadernoNode[], depth = 0, out: { node: CadernoNode; depth: number }[] = []) {
  for (const n of nodes) {
    out.push({ node: n, depth })
    flattenArvore(n.filhos, depth + 1, out)
  }
  return out
}

/**
 * Mesmo conteúdo/colunas de exportPlanilhaSinteticaXlsx (export-planilha-
 * sintetica.ts), só que em PDF — mesmo relatório, formato alternativo.
 * Layout de banner + rodapé com numeração de página segue o padrão já usado
 * em curva-abc/export-pdf.ts (cada exportador standalone desenha o próprio
 * banner, sem depender do módulo do Caderno completo).
 */
export async function exportPlanilhaSinteticaPdf(data: CadernoData) {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 10
  const contentW = pageW - margin * 2

  doc.setFillColor(PDF_COLORS.bannerBg)
  doc.rect(margin, margin, contentW, 16, 'F')
  doc.setTextColor(PDF_COLORS.bannerFg)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('PLANILHA SINTÉTICA', margin + 4, margin + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const subtitle = [
    [data.orcamento.codigo, data.orcamento.nome_obra].filter(Boolean).join(' - '),
    `Gerado em ${formatDate(new Date())}`,
  ].filter(Boolean).join('   •   ')
  doc.text(subtitle, margin + 4, margin + 12.5)

  const flat = flattenArvore(data.arvore)
  const body: RowInput[] = flat.map(({ node, depth }) => {
    const indent = '   '.repeat(depth)
    if (node.tipo === 'grupo') {
      return [node.numero, '', indent + node.descricao, '', '', '', fmt(node.total)]
    }
    return [
      node.numero,
      node.codigo ?? '',
      indent + node.descricao,
      node.unidade ?? '',
      node.quantidade != null ? fmtQtd(node.quantidade) : '',
      node.custoUnitario > 0 ? fmt(node.custoUnitario) : '',
      node.total > 0 ? fmt(node.total) : '',
    ]
  })

  autoTable(doc, {
    startY: margin + 16 + 6,
    margin: { left: margin, right: margin, bottom: margin },
    head: [['Item', 'Código', 'Descrição', 'Und', 'Qtde', 'R$ Unit.', 'R$ Total']],
    body,
    foot: [['', '', 'TOTAL GERAL', '', '', '', fmt(data.totalGeral)]],
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    styles: { fontSize: 7.5, cellPadding: 1.4, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
    headStyles: { fillColor: PDF_COLORS.bannerBg, textColor: '#ffffff', fontStyle: 'bold', halign: 'center', fontSize: 8 },
    footStyles: { fillColor: '#f1f5f9', textColor: '#1e293b', fontStyle: 'bold', lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' },
      1: { cellWidth: 26 },
      2: { cellWidth: contentW - 18 - 26 - 18 - 24 - 32 - 32 },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 32, halign: 'right' },
      6: { cellWidth: 32, halign: 'right' },
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

  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text(`Página ${p} de ${pageCount}`, pageW - margin, pageH - 4, { align: 'right' })
  }

  doc.save(`${slugFilename(data.orcamento.nome_obra)}_sintetica.pdf`)
}
