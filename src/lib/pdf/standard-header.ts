/**
 * Cabeçalho Mestre padronizado — todas as páginas de conteúdo do Caderno.
 */
import type { jsPDF } from 'jspdf'
import { CADERNO_BRAND } from './theme'
import { CADERNO_FONT } from './typography'
import { PDF_PAGE_MARGIN, pdfAutoTableMargins, pdfContentWidth } from './table-layout'

export const STANDARD_HEADER_HEIGHT = 28
export const STANDARD_HEADER_CONTENT_GAP = 4

export interface StandardHeaderData {
  cliente: string | null
  nomeObra: string | null
  revisao: string
  data: string
}

/**
 * Retângulo roxo primário em 3 colunas (FS / Título / Rev+Data).
 * Retorna o Y inicial do conteúdo abaixo do cabeçalho.
 */
export function drawStandardHeader(
  doc: jsPDF,
  data: StandardHeaderData,
  title: string,
): number {
  const margin = PDF_PAGE_MARGIN
  const pageW = doc.internal.pageSize.getWidth()
  const contentW = pdfContentWidth(pageW)

  const LEFT_W = 68
  const RIGHT_W = 52
  const CTR_W = contentW - LEFT_W - RIGHT_W
  const lx = margin
  const cx = margin + LEFT_W
  const rx = cx + CTR_W
  const ty = margin
  const HEADER_H = STANDARD_HEADER_HEIGHT

  doc.setFillColor(CADERNO_BRAND.primary)
  doc.rect(lx, ty, contentW, HEADER_H, 'F')

  doc.setDrawColor('#ffffff')
  doc.setLineWidth(0.15)
  doc.line(cx, ty + 3, cx, ty + HEADER_H - 3)
  doc.line(rx, ty + 3, rx, ty + HEADER_H - 3)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(CADERNO_FONT.docHeaderBrand + 1)
  doc.setTextColor('#ffffff')
  doc.text('FS CONSULTORES', lx + 3, ty + 9)

  doc.setFontSize(CADERNO_FONT.docHeaderMeta)
  const metaLines: [string, string][] = [
    ['Cliente:', data.cliente || '—'],
    ['Obra:', data.nomeObra || '—'],
  ]
  metaLines.forEach(([label, value], i) => {
    const lineY = ty + 16 + i * 6
    doc.setFont('helvetica', 'bold')
    doc.text(label, lx + 3, lineY)
    doc.setFont('helvetica', 'normal')
    const labelW = doc.getTextWidth(label) + 1.5
    doc.text(doc.splitTextToSize(value, LEFT_W - labelW - 6)[0] ?? value, lx + 3 + labelW, lineY)
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor('#ffffff')
  doc.text(title, cx + CTR_W / 2, ty + HEADER_H / 2 + 2, { align: 'center' })

  doc.setFontSize(10)
  doc.text(data.revisao, rx + RIGHT_W - 3, ty + 11, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(CADERNO_FONT.docHeaderMeta)
  doc.text(`Data: ${data.data}`, rx + RIGHT_W - 3, ty + 20, { align: 'right' })

  return ty + HEADER_H + STANDARD_HEADER_CONTENT_GAP
}

/** Y do topo da tabela quando o cabeçalho mestre ocupa a página. */
export function standardHeaderTableTop(): number {
  return PDF_PAGE_MARGIN + STANDARD_HEADER_HEIGHT + STANDARD_HEADER_CONTENT_GAP
}

/**
 * Hooks do autoTable para repetir o cabeçalho mestre em TODAS as páginas da tabela.
 *
 * IMPORTANTE: HookData.pageNumber é o índice da página **dentro da tabela** (1, 2, 3…),
 * não o número global do documento — por isso comparações com doc.getNumberOfPages() falhavam.
 */
export function standardHeaderAutoTableHooks(
  doc: jsPDF,
  headerData: StandardHeaderData,
  title: string,
  options?: { skipFirstTablePage?: boolean },
) {
  const tableTop = standardHeaderTableTop()

  const drawOnTablePage = (tablePageNumber: number) => {
    if (options?.skipFirstTablePage && tablePageNumber === 1) return
    drawStandardHeader(doc, headerData, title)
  }

  return {
    margin: pdfAutoTableMargins({ top: tableTop }),
    /** Repete o cabeçalho mestre em cada página da tabela (zona reservada por margin.top). */
    didDrawPage: (data: { pageNumber: number }) => {
      drawOnTablePage(data.pageNumber)
    },
  }
}

/** @deprecated Use standardHeaderAutoTableHooks */
export function standardHeaderContinuationHook(
  doc: jsPDF,
  data: StandardHeaderData,
  title: string,
  _pageAtTableStart: number,
): (hook: { pageNumber: number }) => void {
  const hooks = standardHeaderAutoTableHooks(doc, data, title, { skipFirstTablePage: true })
  return hooks.didDrawPage
}

/** @deprecated Use standardHeaderAutoTableHooks */
export function standardHeaderPageHook(
  doc: jsPDF,
  data: StandardHeaderData,
  title: string,
): () => void {
  return () => drawStandardHeader(doc, data, title)
}
