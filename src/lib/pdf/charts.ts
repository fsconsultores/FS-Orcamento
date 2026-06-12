import type { jsPDF } from 'jspdf'
import { PDF_COLORS } from './abc-section'

export interface DonutSegment {
  label: string
  value: number
  color: string
}

// ─── Gráfico de rosca (vetorial) ─────────────────────────────────────────────

export function drawDonutChart(doc: jsPDF, segments: DonutSegment[], cx: number, cy: number, outerR: number, innerRRatio = 0.55) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total <= 0) {
    doc.setDrawColor(PDF_COLORS.axis)
    doc.setLineWidth(0.2)
    doc.circle(cx, cy, outerR, 'S')
    doc.setFontSize(8)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text('Sem dados', cx, cy, { align: 'center' })
    return
  }

  const innerR = outerR * innerRRatio
  const step = Math.PI / 60 // ~3°
  let angle = -Math.PI / 2

  for (const seg of segments) {
    const sweep = (seg.value / total) * 2 * Math.PI
    if (sweep <= 0) continue
    doc.setFillColor(seg.color)
    const segSteps = Math.max(1, Math.ceil(sweep / step))
    const segStep = sweep / segSteps
    for (let i = 0; i < segSteps; i++) {
      const a1 = angle + i * segStep
      const a2 = angle + (i + 1) * segStep
      const x1 = cx + Math.cos(a1) * outerR
      const y1 = cy + Math.sin(a1) * outerR
      const x2 = cx + Math.cos(a2) * outerR
      const y2 = cy + Math.sin(a2) * outerR
      doc.triangle(cx, cy, x1, y1, x2, y2, 'F')
    }
    angle += sweep
  }

  doc.setFillColor('#ffffff')
  doc.circle(cx, cy, innerR, 'F')
}

export function drawDonutLegend(doc: jsPDF, segments: DonutSegment[], x: number, y: number, lineH: number, fontSize: number, colW: number, maxRows: number) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(fontSize)
  const labelOffset = fontSize * 0.9
  const maxTextW = colW - labelOffset - 2
  segments.forEach((seg, i) => {
    const col = Math.floor(i / maxRows)
    const row = i % maxRows
    const lx = x + col * colW
    const ly = y + row * lineH
    doc.setFillColor(seg.color)
    doc.rect(lx, ly - fontSize * 0.32, fontSize * 0.5, fontSize * 0.5, 'F')
    doc.setTextColor('#374151')
    let label = seg.label
    while (doc.getTextWidth(label) > maxTextW && label.length > 3) {
      label = label.slice(0, -2) + '…'
    }
    doc.text(label, lx + labelOffset, ly)
  })
}

// ─── KPI card genérico ────────────────────────────────────────────────────────

export interface KpiCardStyle {
  bg: string
  fg: string
  subFg: string
}

export const KPI_STYLE_PRIMARY: KpiCardStyle = { bg: PDF_COLORS.totalBg, fg: PDF_COLORS.totalFg, subFg: PDF_COLORS.totalSubFg }
export const KPI_STYLE_NEUTRAL: KpiCardStyle = { bg: '#f1f5f9', fg: '#1e293b', subFg: '#64748b' }

export function drawKpiCard(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, sub: string | undefined, style: KpiCardStyle) {
  doc.setFillColor(style.bg)
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'F')
  doc.setTextColor(style.fg)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(label, x + 3, y + 5)
  doc.setFontSize(11)
  doc.text(value, x + 3, y + (sub ? h - 5.5 : h - 3))
  if (sub) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(style.subFg)
    doc.text(sub, x + 3, y + h - 1.5)
  }
}
