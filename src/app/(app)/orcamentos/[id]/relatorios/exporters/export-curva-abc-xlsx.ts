import type { AbcItem } from '@/lib/curva-abc'
import { downloadWorkbook } from './xlsx-shared'

export async function exportCurvaAbcXlsx(items: AbcItem[], sheetTitle: string, filenameBase: string) {
  const total = items.reduce((s, i) => s + i.valor_total, 0)

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'FS Orçamento'
  const ws = wb.addWorksheet(sheetTitle.slice(0, 31))

  const C = {
    hBg: 'FF1E40AF', hFg: 'FFFFFFFF',
    aBg: 'FFD1FAE5', bBg: 'FFFEF3C7', cBg: 'FFFEE2E2',
    totBg: 'FFF1F5F9', dark: 'FF1E293B', border: 'FFCBD5E1',
  }
  const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
  const bdr = () => { const b = { style: 'thin' as const, color: { argb: C.border } }; return { top: b, bottom: b, left: b, right: b } }

  ws.columns = [
    { width: 5 }, { width: 14 }, { width: 45 }, { width: 6 },
    { width: 12 }, { width: 16 }, { width: 16 }, { width: 11 }, { width: 11 }, { width: 8 },
  ]

  const hRow = ws.addRow(['#', 'Código', 'Descrição', 'Und', 'Quantidade', 'Custo Unit. (R$)', 'Valor Total (R$)', '% Individual', '% Acumulado', 'Classe'])
  hRow.height = 18
  hRow.eachCell({ includeEmpty: true }, (cell: any) => {
    cell.fill = fill(C.hBg)
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.hFg } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = bdr()
  })

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const bg = item.classe === 'A' ? C.aBg : item.classe === 'B' ? C.bBg : C.cBg
    const row = ws.addRow([
      i + 1, item.codigo ?? '', item.descricao,
      item.unidade ?? '', item.quantidade, item.custo_unitario,
      item.valor_total,
      +item.percentual.toFixed(4),
      +item.percentual_acumulado.toFixed(4),
      item.classe,
    ])
    row.height = 14
    row.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
      cell.fill = fill(bg)
      cell.font = { name: 'Calibri', size: 9, bold: c === 10, color: { argb: C.dark } }
      cell.alignment = { horizontal: c === 1 || c >= 5 ? 'right' : c === 4 || c === 10 ? 'center' : 'left', vertical: 'middle' }
      cell.border = bdr()
      if ((c === 5 || c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
      if ((c === 8 || c === 9) && typeof cell.value === 'number') cell.numFmt = '#,##0.00##'
    })
  }

  const tRow = ws.addRow(['', '', `${items.length} itens`, '', '', 'TOTAL', total, '', '', ''])
  tRow.height = 16
  tRow.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
    cell.fill = fill(C.totBg)
    cell.font = { name: 'Calibri', size: 9, bold: c === 3 || c === 6 || c === 7, color: { argb: C.dark } }
    cell.alignment = { horizontal: c === 6 || c >= 5 ? 'right' : 'left', vertical: 'middle' }
    cell.border = bdr()
    if (c === 7 && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
  })

  await downloadWorkbook(wb, `${filenameBase}_${new Date().toISOString().split('T')[0]}.xlsx`)
}
