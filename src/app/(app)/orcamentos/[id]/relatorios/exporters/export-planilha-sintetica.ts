import type { CadernoData, CadernoNode } from '@/lib/orcamento/caderno'
import { sanitize, XLSX_COLORS as C, xlsxFill as fill, xlsxBorder as bdr, addSheetHeader, downloadWorkbook, slugFilename } from './xlsx-shared'

function flattenArvore(nodes: CadernoNode[], depth = 0): { node: CadernoNode; depth: number }[] {
  const out: { node: CadernoNode; depth: number }[] = []
  for (const n of nodes) {
    out.push({ node: n, depth })
    if (n.filhos.length > 0) out.push(...flattenArvore(n.filhos, depth + 1))
  }
  return out
}

export function countPlanilhaSinteticaItens(data: CadernoData): number {
  return flattenArvore(data.arvore).filter(r => r.node.tipo === 'item').length
}

export interface PlanilhaSinteticaPreviewRow {
  tipo: 'grupo' | 'item'
  depth: number
  numero: string
  descricao: string
  unidade: string | null
  total: number
}

export function previewPlanilhaSintetica(data: CadernoData, limit = 8): PlanilhaSinteticaPreviewRow[] {
  return flattenArvore(data.arvore).slice(0, limit).map(({ node, depth }) => ({
    tipo: node.tipo, depth, numero: node.numero, descricao: node.descricao, unidade: node.unidade, total: node.total,
  }))
}

export async function exportPlanilhaSinteticaXlsx(data: CadernoData) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'FS Orçamento'
  const ws = wb.addWorksheet('Planilha')

  ws.columns = [
    { width: 10 }, { width: 13 }, { width: 52 },
    { width: 6 }, { width: 12 }, { width: 15 }, { width: 16 },
  ]

  await addSheetHeader(wb, ws, 'PLANILHA DE ORÇAMENTO', data.orcamento)

  const hRow = ws.addRow(['Item', 'Código', 'Descrição', 'Und', 'Qtde', 'R$ Unit.', 'R$ Total'])
  hRow.height = 20
  hRow.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
    cell.fill = fill(C.headerBg)
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.headerFg } }
    cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle' }
    cell.border = { top: bdr('medium', C.borderDk), bottom: bdr('medium', C.borderDk), left: bdr('thin', C.border), right: bdr('thin', C.border) }
  })

  for (const { node, depth } of flattenArvore(data.arvore)) {
    const isItem = node.tipo === 'item'
    const row = ws.addRow([
      sanitize(node.numero) || '',
      sanitize(node.codigo) || '',
      sanitize('  '.repeat(depth) + node.descricao) || '',
      sanitize(node.unidade) || '',
      isItem && node.quantidade != null ? node.quantidade : '',
      isItem && node.custoUnitario > 0 ? node.custoUnitario : '',
      node.total > 0 ? node.total : '',
    ])

    let bg: string, fg: string, bold: boolean, sz: number, ht: number
    if (depth === 0) { bg = C.slate800; fg = C.white; bold = true; sz = 10; ht = 18 }
    else if (depth === 1) { bg = C.blue50; fg = C.blue950; bold = true; sz = 9; ht = 15 }
    else if (depth === 2) { bg = C.slate50; fg = C.gray700; bold = false; sz = 9; ht = 15 }
    else { bg = C.white; fg = C.gray700; bold = false; sz = 9; ht = 15 }

    row.height = ht
    const dk = depth === 0
    row.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
      cell.fill = fill(bg)
      cell.font = { name: 'Calibri', size: sz, bold, color: { argb: fg } }
      cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
      cell.border = { top: bdr('thin', dk ? C.borderDk : C.border), bottom: bdr('thin', dk ? C.borderDk : C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
      if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
    })
  }

  const tRow = ws.addRow(['', '', 'TOTAL GERAL', '', '', '', data.totalGeral])
  tRow.height = 20
  tRow.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
    cell.fill = fill(C.slate800)
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: c === 3 ? C.headerFg : C.white } }
    cell.alignment = { horizontal: c >= 5 ? 'right' : c === 3 ? 'right' : 'left', vertical: 'middle' }
    cell.border = { top: bdr('medium', C.slate700), bottom: bdr('thin', C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
    if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
  })

  await downloadWorkbook(wb, `${slugFilename(data.orcamento.nome_obra)}.xlsx`)
}
