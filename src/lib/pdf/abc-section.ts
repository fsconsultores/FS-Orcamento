import type { jsPDF } from 'jspdf'
import type { RowInput } from 'jspdf-autotable'
import type { AbcItem } from '@/lib/curva-abc'
import { fmt, fmtQtd, fmtPct } from '@/lib/curva-abc'

export const PDF_COLORS = {
  bannerBg: '#442246',
  bannerFg: '#ffffff',
  totalBg: '#7c4180',
  totalFg: '#ffffff',
  totalSubFg: '#e9d5ff',
  a: { bg: '#ecfdf5', fg: '#047857', sub: '#34d399' },
  b: { bg: '#fffbeb', fg: '#b45309', sub: '#fbbf24' },
  c: { bg: '#fff1f2', fg: '#be123c', sub: '#fb7185' },
  zoneA: '#f0fdf4',
  zoneB: '#fffbeb',
  zoneC: '#fff1f2',
  gridLight: '#e5e7eb',
  gridStrong: '#9ca3af',
  axis: '#d1d5db',
  line: '#2563eb',
  green: '#16a34a',
  amber: '#d97706',
  rose: '#dc2626',
  textGray: '#6b7280',
}

// ─── Curva ABC chart (vetorial) ──────────────────────────────────────────────

export function drawAbcChart(doc: jsPDF, items: AbcItem[], x: number, y: number, w: number, h: number) {
  doc.setDrawColor(PDF_COLORS.axis)
  doc.setLineWidth(0.2)
  doc.rect(x, y, w, h)

  if (items.length === 0) {
    doc.setFontSize(9)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text('Nenhum dado disponível', x + w / 2, y + h / 2, { align: 'center' })
    return
  }

  const pL = w * (50 / 800)
  const pR = w * (20 / 800)
  const pT = h * (24 / 290)
  const pB = h * (36 / 290)
  const cW = w - pL - pR
  const cH = h - pT - pB

  const N = items.length
  const countA = items.filter(i => i.classe === 'A').length
  const countB = items.filter(i => i.classe === 'B').length
  const fA = countA / N
  const fAB = (countA + countB) / N

  const toX = (frac: number) => x + pL + frac * cW
  const toY = (pct: number) => y + pT + cH - (pct / 100) * cH

  // Background zones
  doc.setFillColor(PDF_COLORS.zoneA)
  doc.rect(toX(0), y + pT, fA * cW, cH, 'F')
  doc.setFillColor(PDF_COLORS.zoneB)
  doc.rect(toX(fA), y + pT, (fAB - fA) * cW, cH, 'F')
  doc.setFillColor(PDF_COLORS.zoneC)
  doc.rect(toX(fAB), y + pT, (1 - fAB) * cW, cH, 'F')

  // Grid lines
  const yGridLines = [20, 40, 60, 80, 95, 100]
  for (const pct of yGridLines) {
    const strong = pct === 80 || pct === 95
    doc.setDrawColor(strong ? PDF_COLORS.gridStrong : PDF_COLORS.gridLight)
    doc.setLineWidth(strong ? 0.25 : 0.1)
    if (strong) doc.setLineDashPattern([1, 0.8], 0)
    doc.line(x + pL, toY(pct), x + pL + cW, toY(pct))
    if (strong) doc.setLineDashPattern([], 0)
  }

  // Vertical zone separators
  if (countA > 0 && countA < N) {
    doc.setDrawColor(PDF_COLORS.green)
    doc.setLineWidth(0.25)
    doc.setLineDashPattern([1, 0.8], 0)
    doc.line(toX(fA), y + pT, toX(fA), y + pT + cH)
    doc.setLineDashPattern([], 0)
  }
  if (countB > 0 && countA + countB < N) {
    doc.setDrawColor(PDF_COLORS.amber)
    doc.setLineWidth(0.25)
    doc.setLineDashPattern([1, 0.8], 0)
    doc.line(toX(fAB), y + pT, toX(fAB), y + pT + cH)
    doc.setLineDashPattern([], 0)
  }

  // Axes
  doc.setDrawColor(PDF_COLORS.axis)
  doc.setLineWidth(0.2)
  doc.line(x + pL, y + pT, x + pL, y + pT + cH)
  doc.line(x + pL, y + pT + cH, x + pL + cW, y + pT + cH)

  // Y axis labels
  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(PDF_COLORS.textGray)
  for (const pct of yGridLines) {
    doc.text(`${pct}%`, x + pL - 1.2, toY(pct) + 1, { align: 'right' })
  }
  doc.text('0%', x + pL - 1.2, toY(0) + 1, { align: 'right' })

  // Reference labels (right side)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(PDF_COLORS.green)
  doc.text('80%', x + pL + cW + 1, toY(80) + 1)
  doc.setTextColor(PDF_COLORS.amber)
  doc.text('95%', x + pL + cW + 1, toY(95) + 1)

  // Zone labels (top)
  doc.setFontSize(8)
  if (countA > 0) {
    doc.setTextColor(PDF_COLORS.green)
    doc.text('A', toX(fA / 2), y + pT + 3.5, { align: 'center' })
  }
  if (countB > 0) {
    doc.setTextColor(PDF_COLORS.amber)
    doc.text('B', toX((fA + fAB) / 2), y + pT + 3.5, { align: 'center' })
  }
  if (N - countA - countB > 0) {
    doc.setTextColor(PDF_COLORS.rose)
    doc.text('C', toX((fAB + 1) / 2), y + pT + 3.5, { align: 'center' })
  }

  // Cumulative curve
  doc.setDrawColor(PDF_COLORS.line)
  doc.setLineWidth(0.5)
  let prevX = toX(0)
  let prevY = toY(0)
  for (let i = 0; i < N; i++) {
    const px = toX((i + 1) / N)
    const py = toY(items[i].percentual_acumulado)
    doc.line(prevX, prevY, px, py)
    prevX = px
    prevY = py
  }

  // X axis label
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(PDF_COLORS.textGray)
  doc.text(`Itens ordenados por valor (${N} itens)`, x + pL + cW / 2, y + h - 1.5, { align: 'center' })
}

// ─── KPI cards (Total Geral + Classe A/B/C) ──────────────────────────────────

/** Desenha as 4 KPI cards e retorna a altura ocupada (mm). */
export function drawAbcKpiCards(doc: jsPDF, items: AbcItem[], x: number, y: number, w: number): number {
  const total = items.reduce((s, i) => s + i.valor_total, 0)
  const byClass = (c: 'A' | 'B' | 'C') => items.filter(i => i.classe === c)
  const sumClass = (c: 'A' | 'B' | 'C') => byClass(c).reduce((s, i) => s + i.valor_total, 0)
  const pctClass = (c: 'A' | 'B' | 'C') => (total > 0 ? (sumClass(c) / total) * 100 : 0)

  const cardH = 18
  const gap = 3
  const cardW = (w - gap * 3) / 4

  const cards = [
    { label: 'TOTAL GERAL', value: fmt(total), sub: `${items.length} itens`, bg: PDF_COLORS.totalBg, fg: PDF_COLORS.totalFg, subFg: PDF_COLORS.totalSubFg },
    { label: 'CLASSE A (≤ 80%)', value: fmt(sumClass('A')), sub: `${byClass('A').length} itens · ${pctClass('A').toFixed(1)}%`, bg: PDF_COLORS.a.bg, fg: PDF_COLORS.a.fg, subFg: PDF_COLORS.a.sub },
    { label: 'CLASSE B (80–95%)', value: fmt(sumClass('B')), sub: `${byClass('B').length} itens · ${pctClass('B').toFixed(1)}%`, bg: PDF_COLORS.b.bg, fg: PDF_COLORS.b.fg, subFg: PDF_COLORS.b.sub },
    { label: 'CLASSE C (> 95%)', value: fmt(sumClass('C')), sub: `${byClass('C').length} itens · ${pctClass('C').toFixed(1)}%`, bg: PDF_COLORS.c.bg, fg: PDF_COLORS.c.fg, subFg: PDF_COLORS.c.sub },
  ]

  cards.forEach((card, i) => {
    const cx = x + i * (cardW + gap)
    doc.setFillColor(card.bg)
    doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, 'F')
    doc.setTextColor(card.fg)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text(card.label, cx + 3, y + 5)
    doc.setFontSize(12)
    doc.text(card.value, cx + 3, y + 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(card.subFg)
    doc.text(card.sub, cx + 3, y + 16)
  })

  return cardH
}

// ─── Tabela de itens ABC ──────────────────────────────────────────────────────

export function abcTableHead(): RowInput[] {
  return [['#', 'Código', 'Descrição', 'Und', 'Quantidade', 'Custo Unit. (R$)', 'Valor Total (R$)', '%', '% Acum.', 'Classe']]
}

export function abcTableBody(items: AbcItem[]): RowInput[] {
  return items.map((item, i) => [
    String(i + 1),
    item.codigo ?? '—',
    item.descricao,
    item.unidade ?? '—',
    fmtQtd(item.quantidade),
    fmt(item.custo_unitario),
    fmt(item.valor_total),
    fmtPct(item.percentual),
    fmtPct(item.percentual_acumulado),
    item.classe,
  ])
}

export function abcTableFoot(items: AbcItem[]): RowInput[] {
  const total = items.reduce((s, i) => s + i.valor_total, 0)
  return [['', '', `${items.length} itens`, '', '', 'TOTAL', fmt(total), '', '', '']]
}

export const abcTableColumnStyles = {
  0: { cellWidth: 8, halign: 'right' as const },
  1: { cellWidth: 20 },
  2: { cellWidth: 111 },
  3: { cellWidth: 12, halign: 'center' as const },
  4: { cellWidth: 22, halign: 'right' as const },
  5: { cellWidth: 26, halign: 'right' as const },
  6: { cellWidth: 28, halign: 'right' as const },
  7: { cellWidth: 14, halign: 'right' as const },
  8: { cellWidth: 16, halign: 'right' as const },
  9: { cellWidth: 14, halign: 'center' as const },
}

export function abcRowFillColor(classe: string): string {
  const palette = classe === 'A' ? PDF_COLORS.a : classe === 'B' ? PDF_COLORS.b : PDF_COLORS.c
  return palette.bg
}

export function abcRowTextColor(classe: string): string {
  const palette = classe === 'A' ? PDF_COLORS.a : classe === 'B' ? PDF_COLORS.b : PDF_COLORS.c
  return palette.fg
}
