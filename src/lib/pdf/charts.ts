/**
 * Gráfico Top 5 — barras horizontais nativas (doc.rect), sem autoTable.
 */
import type { jsPDF } from 'jspdf'
import { fmt, fmtPct } from '@/lib/curva-abc'
import type { DistribuicaoCustoItem } from '@/lib/orcamento/caderno'
import { CADERNO_BRAND } from './theme'
import { CADERNO_FONT } from './typography'
import { filterRealCategoriesForTop5 } from './filters'

/**
 * Categorias à esquerda; barra proporcional; valor financeiro + percentual destacado à direita.
 */
export function drawTop5HorizontalBarChart(
  doc: jsPDF,
  distribuicao: DistribuicaoCustoItem[],
  margin: number,
  contentW: number,
  startY: number,
): number {
  const top5 = filterRealCategoriesForTop5(distribuicao)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(CADERNO_FONT.chartTitle)
  doc.setTextColor('#374151')
  doc.text('PRINCIPAIS ITENS DO ORÇAMENTO', margin, startY)

  let y = startY + 9

  if (top5.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(CADERNO_FONT.bodySm)
    doc.setTextColor('#64748b')
    doc.text('Nenhuma categoria com valor registrado.', margin, y + 2)
    return y + 14
  }

  // Área de rótulo ampla — evita truncar nomes longos (ex.: "04 — EQUIPAMENTOS E CONSUMO").
  const labelW = contentW * 0.38
  const pctW = 24
  const valueW = 52
  const gap = 4
  const barMaxW = Math.max(20, contentW - labelW - valueW - pctW - gap * 2)
  const barH = 5.5
  const labelLineH = 3.8
  const minRowH = 15
  const maxPct = top5[0]?.percentual ?? 100

  let rowY = y

  top5.forEach(item => {
    const label = item.numero ? `${item.numero} — ${item.label}` : item.label

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(CADERNO_FONT.bodySm)
    doc.setTextColor('#374151')
    const labelLines = doc.splitTextToSize(label, labelW - 2)
    const rowH = Math.max(minRowH, labelLines.length * labelLineH + 6)
    const rowTop = rowY
    const textY = rowTop + rowH / 2 + 1.2
    const barY = rowTop + (rowH - barH) / 2
    const barX = margin + labelW

    doc.text(labelLines, margin, rowTop + 3.5)

    doc.setFillColor('#e2e8f0')
    doc.rect(barX, barY, barMaxW, barH, 'F')

    const fillW = maxPct > 0 ? Math.max(2, barMaxW * (item.percentual / maxPct)) : 0
    if (fillW > 0) {
      doc.setFillColor(CADERNO_BRAND.primary)
      doc.rect(barX, barY, fillW, barH, 'F')
    }

    const valueRight = margin + contentW - pctW - 2
    const pctRight = margin + contentW

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(CADERNO_FONT.bodySm)
    doc.setTextColor('#64748b')
    doc.text(fmt(item.value), valueRight, textY, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(CADERNO_FONT.bodySm + 1.5)
    doc.setTextColor(CADERNO_BRAND.primary)
    doc.text(fmtPct(item.percentual), pctRight, textY, { align: 'right' })

    rowY += rowH
  })

  return rowY + 6
}
