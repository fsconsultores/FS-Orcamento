/**
 * Capa oficial — grafismos azuis nas quinas + título central imponente.
 */
import type { jsPDF } from 'jspdf'
import { formatDate } from '@/lib/format-date'
import { CADERNO_BRAND, PDF_COLORS } from './theme'
import { drawBrandCornerBars } from './layout'
import { BRAND_LOGO_PNG_PATH, BRAND_LOGO_PNG_ASPECT } from './assets'

export interface CadernoCoverInfo {
  nomeObra: string
  codigo: string | null
  cliente: string | null
  numeroRevisao?: number | null
}

export function formatRevisaoLabel(numeroRevisao?: number | null): string {
  const n = numeroRevisao ?? 1
  return `Rev. ${String(n).padStart(2, '0')}`
}

function drawCenteredLabelValue(
  doc: jsPDF,
  cx: number,
  y: number,
  label: string,
  value: string,
) {
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  const labelStr = `${label}: `
  const labelW = doc.getTextWidth(labelStr)
  doc.setFont('helvetica', 'normal')
  const valueW = doc.getTextWidth(value)
  const startX = cx - (labelW + valueW) / 2

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(CADERNO_BRAND.indigo)
  doc.text(labelStr, startX, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(PDF_COLORS.textPrimary)
  doc.text(value, startX + labelW, y)
}

export async function drawCadernoCoverPage(
  doc: jsPDF,
  info: CadernoCoverInfo,
  pageW: number,
  pageH: number,
) {
  doc.setFillColor('#ffffff')
  doc.rect(0, 0, pageW, pageH, 'F')

  drawBrandCornerBars(doc, pageW, pageH, CADERNO_BRAND.secondary)

  const cx = pageW / 2
  const centerY = pageH / 2

  // Logo real da FS Consultores (public/logofs.png, o mesmo arquivo já usado na
  // exportação em Excel — ver use-planilha-export.ts). Se o fetch falhar, a capa
  // segue sem logo em vez de travar a exportação do Caderno inteiro.
  try {
    const resp = await fetch(BRAND_LOGO_PNG_PATH)
    if (resp.ok) {
      const buf = await resp.arrayBuffer()
      const logoW = 90
      const logoH = logoW * BRAND_LOGO_PNG_ASPECT
      doc.addImage(new Uint8Array(buf), 'PNG', (pageW - logoW) / 2, 28, logoW, logoH)
    }
  } catch { /* logo opcional — nunca bloqueia a exportação */ }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(36)
  doc.setTextColor(CADERNO_BRAND.primary)
  doc.text('CADERNO DE ORÇAMENTO', cx, centerY - 22, { align: 'center' })

  doc.setFontSize(24)
  doc.setTextColor(CADERNO_BRAND.secondary)
  doc.text(info.nomeObra || '—', cx, centerY - 2, { align: 'center' })

  const metaLines: [string, string][] = [
    ['Código', info.codigo || '—'],
    ['Revisão', formatRevisaoLabel(info.numeroRevisao)],
    ['Cliente', info.cliente || '—'],
    ['Data', formatDate(new Date())],
  ]

  let metaY = centerY + 18
  for (const [label, value] of metaLines) {
    drawCenteredLabelValue(doc, cx, metaY, label, value)
    metaY += 8
  }
}
