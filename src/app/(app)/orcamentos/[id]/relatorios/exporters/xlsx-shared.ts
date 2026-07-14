import type { CadernoData } from '@/lib/orcamento/caderno'

export function sanitize(v: string | null | undefined): string {
  return (v ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

export const XLSX_COLORS = {
  slate800: 'FF1E293B', slate700: 'FF334155', slate50: 'FFF8FAFC',
  blue50: 'FFEFF6FF', blue950: 'FF172554',
  white: 'FFFFFFFF', gray700: 'FF374151',
  headerBg: 'FFF1F5F9', headerFg: 'FF64748B',
  border: 'FFE2E8F0', borderDk: 'FF475569',
  insumoFg: 'FF4B5563', insumoBdr: 'FFF0F4F8',
}

export function xlsxFill(argb: string) {
  return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } }
}

export function xlsxBorder(style: 'thin' | 'medium', argb: string) {
  return { style, color: { argb } }
}

export async function addSheetHeader(wb: any, ws: any, titulo: string, orcamento: CadernoData['orcamento']) {
  const hFill = xlsxFill
  const hBdr = xlsxBorder
  const dataStr = orcamento.data
    ? new Date(orcamento.data + 'T00:00:00').toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR')

  const r1 = ws.addRow([]); r1.height = 32
  const r2 = ws.addRow([]); r2.height = 22
  ws.addRow([]).height = 5

  ws.mergeCells('A1:B1')
  ws.mergeCells('A2:B2')
  ws.mergeCells('C1:E2')
  ws.mergeCells('F1:G1')
  ws.mergeCells('F2:G2')

  try {
    const resp = await fetch('/logofs.png')
    if (resp.ok) {
      const buf = await resp.arrayBuffer()
      const imgId = wb.addImage({ buffer: buf, extension: 'png' })
      ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 130, height: 32 } })
    }
  } catch { /* logo opcional */ }

  const outerBdr = {
    top: hBdr('medium', 'FF334155'), bottom: hBdr('medium', 'FF334155'),
    left: hBdr('medium', 'FF334155'), right: hBdr('medium', 'FF334155'),
  }

  const logoCell = ws.getCell('A1')
  logoCell.fill = hFill('FFFFFFFF')
  logoCell.border = { ...outerBdr, bottom: hBdr('thin', 'FFE2E8F0'), right: hBdr('thin', 'FFE2E8F0') }

  const infoCell = ws.getCell('A2')
  infoCell.value = `Cliente: ${orcamento.cliente ?? '—'}     Obra: ${orcamento.nome_obra ?? '—'}`
  infoCell.font = { name: 'Calibri', size: 8, color: { argb: 'FF374151' } }
  infoCell.alignment = { vertical: 'middle', horizontal: 'left' }
  infoCell.fill = hFill('FFF8FAFC')
  infoCell.border = { ...outerBdr, top: hBdr('thin', 'FFE2E8F0'), right: hBdr('thin', 'FFE2E8F0') }

  const titleCell = ws.getCell('C1')
  titleCell.value = titulo
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = hFill('FF1E293B')
  titleCell.border = { ...outerBdr, left: hBdr('thin', 'FF334155'), right: hBdr('thin', 'FF334155') }

  const revCell = ws.getCell('F1')
  revCell.value = 'REV 00'
  revCell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FF374151' } }
  revCell.alignment = { horizontal: 'right', vertical: 'middle' }
  revCell.fill = hFill('FFF8FAFC')
  revCell.border = { ...outerBdr, left: hBdr('thin', 'FFE2E8F0'), bottom: hBdr('thin', 'FFE2E8F0') }

  const dateCell = ws.getCell('F2')
  dateCell.value = `Data: ${dataStr}`
  dateCell.font = { name: 'Calibri', size: 8, color: { argb: 'FF374151' } }
  dateCell.alignment = { horizontal: 'right', vertical: 'middle' }
  dateCell.fill = hFill('FFF8FAFC')
  dateCell.border = { ...outerBdr, left: hBdr('thin', 'FFE2E8F0'), top: hBdr('thin', 'FFE2E8F0') }
}

export function downloadBlob(buf: any, mime: string, filename: string) {
  const url = URL.createObjectURL(new Blob([buf], { type: mime }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function slugFilename(nomeObra: string, fallback = 'planilha'): string {
  return (nomeObra || fallback).replace(/[/\\?%*:|"<>]/g, '-').trim()
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function downloadWorkbook(wb: any, filename: string) {
  const buf = await wb.xlsx.writeBuffer()
  downloadBlob(buf, XLSX_MIME, filename)
}
