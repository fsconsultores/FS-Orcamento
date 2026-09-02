/**
 * Seção 4.0 — Custo/m² em cards executivos (sem bloco Cliente/Obra — cabeçalho mestre).
 */
import type { jsPDF } from 'jspdf'
import { fmt, fmtQtd } from '@/lib/curva-abc'
import { CADERNO_BRAND, PDF_COLORS } from './theme'
import { CADERNO_FONT } from './typography'
import { addLandscapeA4Page } from './pdf-document'

export interface CustoM2Pavimento {
  descricao: string
  unidade: string
  area_total: number
  area_equivalente: number
  area_coberta: number
}

export interface CustoM2SectionInput {
  local: string | null
  areaTotal: number | null
  areaCoberta: number | null
  areaEquivalente: number | null
  pavimentos: CustoM2Pavimento[]
  custoTotal: number
}

interface ExecutiveCard {
  label: string
  value: string
  sub?: string
  accent: string
}

function ensureMinSpace(
  doc: jsPDF,
  currentY: number,
  pageH: number,
  margin: number,
  requiredHeight: number,
  onNewPage?: () => number,
): number {
  if (currentY + requiredHeight > pageH - margin) {
    addLandscapeA4Page(doc)
    return onNewPage?.() ?? margin
  }
  return currentY
}

function drawExecutiveCardRow(
  doc: jsPDF,
  margin: number,
  contentW: number,
  y: number,
  cards: ExecutiveCard[],
): number {
  const gap = 4
  const cardW = (contentW - gap * (cards.length - 1)) / cards.length
  const cardH = 28

  cards.forEach((card, i) => {
    const cx = margin + i * (cardW + gap)

    doc.setFillColor('#ffffff')
    doc.setDrawColor(CADERNO_BRAND.primary)
    doc.setLineWidth(0.3)
    doc.rect(cx, y, cardW, cardH, 'FD')

    doc.setFillColor(card.accent)
    doc.rect(cx, y, cardW, 4, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(CADERNO_FONT.kpiLabel)
    doc.setTextColor(CADERNO_BRAND.primary)
    doc.text(doc.splitTextToSize(card.label, cardW - 8)[0] ?? card.label, cx + 4, y + 10)

    doc.setFontSize(CADERNO_FONT.kpiValue)
    doc.setTextColor(PDF_COLORS.textPrimary)
    doc.text(card.value, cx + 4, y + cardH - (card.sub ? 10 : 6))

    if (card.sub) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(CADERNO_FONT.kpiSub)
      doc.setTextColor('#64748b')
      doc.text(card.sub, cx + 4, y + cardH - 3)
    }
  })

  return cardH
}

function drawPavimentosBlock(
  doc: jsPDF,
  margin: number,
  contentW: number,
  y: number,
  pavimentos: CustoM2Pavimento[],
  pageH: number,
  onNewPage?: () => number,
): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(CADERNO_FONT.subsection)
  doc.setTextColor(CADERNO_BRAND.primary)
  doc.text('PAVIMENTOS', margin, y)
  y += 6

  const rowH = 9
  const labelW = contentW * 0.42

  for (const p of pavimentos) {
    y = ensureMinSpace(doc, y, pageH, margin, rowH + 2, onNewPage)

    doc.setDrawColor('#cbd5e1')
    doc.setLineWidth(0.15)
    doc.setFillColor('#f8fafc')
    doc.rect(margin, y, contentW, rowH, 'FD')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(CADERNO_FONT.bodySm)
    doc.setTextColor(PDF_COLORS.textPrimary)
    doc.text(doc.splitTextToSize(p.descricao, labelW - 4)[0] ?? p.descricao, margin + 3, y + 5.5)

    const metrics = [
      `Total: ${fmtQtd(p.area_total)} m²`,
      `Equiv.: ${fmtQtd(p.area_equivalente)} m²`,
      `Cob.: ${fmtQtd(p.area_coberta)} m²`,
    ].join('   •   ')
    doc.setFontSize(8)
    doc.setTextColor('#64748b')
    doc.text(metrics, margin + labelW, y + 5.5)

    y += rowH + 2
  }

  return y
}

/**
 * Conteúdo da seção Custo/m² (após cabeçalho mestre). Retorna Y final.
 */
export function drawCustoM2SectionContent(
  doc: jsPDF,
  margin: number,
  contentW: number,
  pageH: number,
  startY: number,
  input: CustoM2SectionInput,
  onNewPage?: () => number,
): number {
  const { areaTotal, areaCoberta, areaEquivalente, pavimentos, custoTotal: C } = input

  let y = startY

  if (pavimentos.length > 0) {
    y = drawPavimentosBlock(doc, margin, contentW, y, pavimentos, pageH, onNewPage) + 8
  }

  y = ensureMinSpace(doc, y, pageH, margin, 36, onNewPage)
  y += drawExecutiveCardRow(doc, margin, contentW, y, [
    { label: 'CUSTO TOTAL', value: fmt(C), accent: CADERNO_BRAND.primary },
    {
      label: 'ÁREA TOTAL',
      value: areaTotal != null ? `${fmtQtd(areaTotal)} m²` : '—',
      accent: CADERNO_BRAND.secondary,
    },
    {
      label: 'CUSTO / M²',
      value: areaTotal ? fmt(C / areaTotal) : '—',
      sub: 'Referência: área total',
      accent: CADERNO_BRAND.violet,
    },
  ]) + 10

  y = ensureMinSpace(doc, y, pageH, margin, 36, onNewPage)
  y += drawExecutiveCardRow(doc, margin, contentW, y, [
    {
      label: 'ÁREA EQUIVALENTE',
      value: areaEquivalente != null ? `${fmtQtd(areaEquivalente)} m²` : '—',
      accent: CADERNO_BRAND.secondary,
    },
    {
      label: 'CUSTO / M² EQUIV.',
      value: areaEquivalente ? fmt(C / areaEquivalente) : '—',
      accent: CADERNO_BRAND.violet,
    },
    {
      label: 'ÁREAS COBERTAS',
      value: areaCoberta != null ? `${fmtQtd(areaCoberta)} m²` : '—',
      accent: CADERNO_BRAND.secondary,
    },
    {
      label: 'CUSTO / M² COBERTAS',
      value: areaCoberta ? fmt(C / areaCoberta) : '—',
      accent: CADERNO_BRAND.indigo,
    },
  ])

  return y
}
