/**
 * Template visual PDF — cabeçalhos, banners, rodapés e estilos de tabela.
 * Camada puramente de apresentação; recebe apenas strings prontas para exibir.
 */
import type { jsPDF } from 'jspdf'
import { CADERNO_BRAND, PDF_COLORS } from './theme'
import { CADERNO_FONT } from './typography'

import { addLandscapeA4Page } from './pdf-document'
import { PDF_TABLE_MARGIN_LATERAL } from './table-layout'
import { drawStandardHeader } from './standard-header'

export const PDF_MARGIN_DEFAULT = PDF_TABLE_MARGIN_LATERAL
export const PDF_BANNER_HEIGHT = 16

/** Y final da última autoTable, se existir. */
export function getLastAutoTableFinalY(doc: jsPDF): number | null {
  // @ts-expect-error lastAutoTable injetado em runtime pelo jspdf-autotable
  const finalY = doc.lastAutoTable?.finalY
  return typeof finalY === 'number' ? finalY : null
}

/**
 * Garante espaço mínimo na página atual; adiciona nova página se necessário.
 * Retorna o Y de início seguro para o próximo bloco.
 */
export function ensureMinSpace(
  doc: jsPDF,
  currentY: number,
  pageH: number,
  margin: number,
  requiredHeight: number,
): number {
  if (currentY + requiredHeight > pageH - margin) {
    addLandscapeA4Page(doc)
    return margin
  }
  return currentY
}

/** Evita título de seção órfão — banner + conteúdo mínimo na mesma página. */
export function ensureSectionBannerFits(
  doc: jsPDF,
  currentY: number,
  pageH: number,
  margin: number,
  bannerHeight: number,
  minContentAfter: number,
): number {
  const threshold = pageH - margin - minContentAfter
  if (currentY > margin && currentY > threshold) {
    addLandscapeA4Page(doc)
    return margin
  }
  if (currentY + bannerHeight + minContentAfter > pageH - margin) {
    addLandscapeA4Page(doc)
    return margin
  }
  return currentY
}

/** Estilos compactos para planilhas detalhadas (Sintética, Analítica, Preços). */
export const PDF_TABLE_DENSE_BODY_STYLES = {
  fontSize: 7,
  cellPadding: 1,
  valign: 'middle' as const,
  overflow: 'hidden' as const,
  lineColor: PDF_COLORS.tableBorder,
  lineWidth: 0.1,
  textColor: PDF_COLORS.textPrimary,
}

export const PDF_TABLE_DENSE_HEAD_STYLES = {
  fillColor: PDF_COLORS.bannerBg,
  textColor: PDF_COLORS.bannerFg,
  fontStyle: 'bold' as const,
  halign: 'center' as const,
  fontSize: 7,
  cellPadding: 1,
  overflow: 'hidden' as const,
}

/** Estilos padrão para cabeçalho de tabela (jspdf-autotable). */
export const PDF_TABLE_HEAD_STYLES = {
  fillColor: PDF_COLORS.bannerBg,
  textColor: PDF_COLORS.bannerFg,
  fontStyle: 'bold' as const,
  halign: 'center' as const,
  fontSize: 8,
}

/** Estilos padrão para corpo de tabela. */
export const PDF_TABLE_BODY_STYLES = {
  fontSize: 7.5,
  cellPadding: 1.4,
  valign: 'middle' as const,
  overflow: 'linebreak' as const,
  lineColor: PDF_COLORS.tableBorder,
  lineWidth: 0.1,
  textColor: PDF_COLORS.textPrimary,
}

/** Banner superior padrão (planilhas avulsas, Curva ABC, etc.). */
export function drawReportBanner(
  doc: jsPDF,
  margin: number,
  contentW: number,
  title: string,
  subtitle: string,
) {
  const y = margin
  doc.setFillColor(PDF_COLORS.bannerBg)
  doc.rect(margin, y, contentW, PDF_BANNER_HEIGHT, 'F')
  doc.setTextColor(PDF_COLORS.bannerFg)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(title, margin + 4, y + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(PDF_COLORS.bannerSubtitle)
  doc.text(subtitle, margin + 4, y + 12.5)
  doc.setTextColor(PDF_COLORS.textPrimary)
}

/** Numeração de páginas no rodapé. */
export function drawPageNumbers(doc: jsPDF, margin: number, pageW: number, pageH: number) {
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(PDF_COLORS.textMuted)
    doc.text(`Página ${p} de ${pageCount}`, pageW - margin, pageH - 4, { align: 'right' })
  }
}

/** Y inicial do conteúdo após o banner padrão. */
export function contentStartY(margin: number): number {
  return margin + PDF_BANNER_HEIGHT + 6
}

/** @deprecated Use drawStandardHeader — mantido por compatibilidade. */
export function drawCadernoDocumentHeader(
  doc: jsPDF,
  margin: number,
  contentW: number,
  titulo: string,
  cliente: string | null | undefined,
  nomeObra: string | null | undefined,
  dateStr: string,
  revisaoLabel = 'Rev. 01',
) {
  void margin
  void contentW
  drawStandardHeader(doc, {
    cliente: cliente ?? null,
    nomeObra: nomeObra ?? null,
    revisao: revisaoLabel,
    data: dateStr,
  }, titulo)
}

/** Barras decorativas de marca nos cantos (capa/divisórias do Caderno). */
export function drawBrandCornerBars(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  color: string = CADERNO_BRAND.secondary,
) {
  const alturas = [7, 10, 13, 16, 19]
  const barW = 3.2
  const gap = 1.6
  doc.setFillColor(color)

  let x = pageW - (alturas.length * barW + (alturas.length - 1) * gap)
  for (const h of alturas) {
    doc.rect(x, 0, barW, h, 'F')
    x += barW + gap
  }

  x = 0
  for (const h of [...alturas].reverse()) {
    doc.rect(x, pageH - h, barW, h, 'F')
    x += barW + gap
  }
}
