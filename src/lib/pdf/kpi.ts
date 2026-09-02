/**
 * KPI cards do Resumo Geral — largura proporcional, preenchendo a página.
 */
import type { jsPDF } from 'jspdf'
import { CADERNO_BRAND } from './theme'
import { CADERNO_FONT } from './typography'

export interface CadernoKpiCard {
  label: string
  value: string
  sub?: string
  style: { bg: string; fg: string; subFg: string }
}

/** Pesos relativos — cards financeiros um pouco mais largos. */
const KPI_WEIGHTS = [1.15, 1.15, 1, 1, 1]

const KPI_LABEL_FONT = 9
const KPI_SUB_FONT = 6.5
const KPI_LABEL_LINE_H = 3.6
const KPI_SUB_LINE_H = 2.6
const KPI_INSET = 3

/** Quebra programática em até 2 linhas — ex.: "CUSTO/M²" + "(ÁREA EQUIVALENTE)". */
export function splitKpiCardLabel(label: string): string[] {
  const parenIdx = label.indexOf(' (')
  if (parenIdx > 0) {
    return [label.slice(0, parenIdx), label.slice(parenIdx + 1)]
  }
  return [label]
}

export function drawCadernoKpiRow(
  doc: jsPDF,
  x: number,
  y: number,
  contentW: number,
  cards: CadernoKpiCard[],
): number {
  const gap = 3
  const totalWeight = cards.reduce((s, _, i) => s + (KPI_WEIGHTS[i] ?? 1), 0)
  const available = contentW - gap * (cards.length - 1)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(KPI_LABEL_FONT)

  const layouts = cards.map((card, i) => {
    const w = available * ((KPI_WEIGHTS[i] ?? 1) / totalWeight)
    const innerW = w - KPI_INSET * 2
    const labelLines = splitKpiCardLabel(card.label)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(KPI_SUB_FONT)
    const subLines = card.sub ? doc.splitTextToSize(card.sub, innerW) : []
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(KPI_LABEL_FONT)
    return { w, card, labelLines, subLines }
  })

  const maxLabelLines = Math.max(1, ...layouts.map(l => l.labelLines.length))
  const maxSubLines = Math.max(0, ...layouts.map(l => l.subLines.length))
  const cardH = Math.max(
    28,
    5 + maxLabelLines * KPI_LABEL_LINE_H + 11 + (maxSubLines > 0 ? maxSubLines * KPI_SUB_LINE_H + 2 : 0),
  )

  let cx = x
  layouts.forEach(({ w, card, labelLines, subLines }) => {
    doc.setFillColor(card.style.bg)
    doc.roundedRect(cx, y, w, cardH, 2, 2, 'F')

    doc.setTextColor(card.style.fg)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(KPI_LABEL_FONT)
    doc.text(labelLines, cx + w / 2, y + 5, { align: 'center' })

    const valueY = y + 5 + labelLines.length * KPI_LABEL_LINE_H + 7
    doc.setFontSize(CADERNO_FONT.kpiValue)
    doc.text(card.value, cx + w / 2, valueY, { align: 'center' })

    if (subLines.length > 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(KPI_SUB_FONT)
      doc.setTextColor(card.style.subFg)
      doc.text(subLines, cx + w / 2, y + cardH - 2.5 - (subLines.length - 1) * KPI_SUB_LINE_H, { align: 'center' })
    }

    cx += w + gap
  })

  return cardH
}

export const CADERNO_KPI_PRIMARY = CADERNO_BRAND.kpiPrimary
export const CADERNO_KPI_NEUTRAL = { bg: '#f1f5f9', fg: '#1e293b', subFg: '#64748b' }
