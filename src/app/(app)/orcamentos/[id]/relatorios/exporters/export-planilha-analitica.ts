import type { CadernoData, PlanilhaAnaliticaRow, AbcClasse } from '@/lib/orcamento/caderno'
import { filterAnaliticaRows, buildAgrupadaRows, type CategoriaAnalitica } from '@/lib/orcamento/analitica-filtros'
import { sanitize, XLSX_COLORS as C, xlsxFill as fill, xlsxBorder as bdr, addSheetHeader, downloadWorkbook, slugFilename } from './xlsx-shared'

export type AnaliticaModo = 'normal' | 'decomposta' | 'agrupada'

export interface AnaliticaFilterState {
  modo: AnaliticaModo
  categorias: Set<CategoriaAnalitica>
  classesAbc: Set<AbcClasse>
  mostrarPrecos: boolean
}

export function defaultAnaliticaFilterState(): AnaliticaFilterState {
  return { modo: 'normal', categorias: new Set(), classesAbc: new Set(), mostrarPrecos: true }
}

/** Linhas resultantes depois de aplicar modo + filtros — usado tanto pela prévia quanto pelo export. */
export function buildAnaliticaRows(data: CadernoData, opts: AnaliticaFilterState): PlanilhaAnaliticaRow[] {
  if (opts.modo === 'agrupada') {
    // Consumo total por insumo no orçamento inteiro (não o índice por unidade de
    // serviço) — classe ABC é um conceito por item da planilha, não se aplica aqui.
    return buildAgrupadaRows(data.insumosConsumo, opts.categorias)
  }
  const base = opts.modo === 'normal' ? data.planilhaAnalitica : data.planilhaAnaliticaDecomposta
  return filterAnaliticaRows(base, { categorias: opts.categorias, classesAbc: opts.classesAbc })
}

const TITULOS: Record<AnaliticaModo, string> = {
  normal: 'PLANILHA ANALÍTICA DE PREÇOS UNITÁRIOS',
  decomposta: 'PLANILHA ANALÍTICA DECOMPOSTA',
  agrupada: 'PLANILHA ANALÍTICA AGRUPADA POR TIPO DE INSUMO',
}

const SUFIXOS: Record<AnaliticaModo, string> = {
  normal: '_analitica',
  decomposta: '_analitica_decomposta',
  agrupada: '_analitica_agrupada',
}

export async function exportPlanilhaAnaliticaXlsx(data: CadernoData, opts: AnaliticaFilterState) {
  const rows = buildAnaliticaRows(data, opts)
  // "Total no Item" (índice × quantidade do item na planilha) só faz sentido nos
  // modos Normal/Decomposta — no Agrupado a coluna "Qtde" já é o total do
  // orçamento inteiro, mostrar as duas seria redundante.
  const mostrarTotalItem = opts.modo !== 'agrupada'
  const cUnit = mostrarTotalItem ? 7 : 6
  const cTotal = mostrarTotalItem ? 8 : 7

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'FS Orçamento'
  const ws = wb.addWorksheet('Planilha Analítica')

  ws.columns = mostrarTotalItem
    ? [{ width: 10 }, { width: 13 }, { width: 48 }, { width: 6 }, { width: 11 }, { width: 13 }, { width: 15 }, { width: 16 }]
    : [{ width: 10 }, { width: 13 }, { width: 55 }, { width: 6 }, { width: 12 }, { width: 15 }, { width: 16 }]

  await addSheetHeader(wb, ws, TITULOS[opts.modo], data.orcamento)

  const headers = mostrarTotalItem
    ? ['Item', 'Código', 'Descrição', 'Und', 'Qtde', 'Total no Item', 'R$ Unit.', 'R$ Total']
    : ['Item', 'Código', 'Descrição', 'Und', 'Qtde', 'R$ Unit.', 'R$ Total']
  const hRow = ws.addRow(headers)
  hRow.height = 20
  hRow.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
    cell.fill = fill(C.headerBg)
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.headerFg } }
    cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle' }
    cell.border = { top: bdr('medium', C.borderDk), bottom: bdr('medium', C.borderDk), left: bdr('thin', C.border), right: bdr('thin', C.border) }
  })

  let totalGeralExibido = 0

  for (const row of rows) {
    if (row.tipo === 'grupo') {
      const values = mostrarTotalItem
        ? [row.numero, '', sanitize(row.descricao) || '', '', '', '', '', '']
        : [row.numero, '', sanitize(row.descricao) || '', '', '', '', '']
      const r = ws.addRow(values)
      r.height = 18
      r.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
        cell.fill = fill(C.slate800)
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('thin', C.borderDk), bottom: bdr('thin', C.borderDk), left: bdr('thin', C.border), right: bdr('thin', C.border) }
      })
    } else if (row.tipo === 'item') {
      totalGeralExibido += row.custoTotal
      const qtde = row.quantidade > 0 ? row.quantidade : ''
      const unit = opts.mostrarPrecos && row.custoUnitario > 0 ? row.custoUnitario : ''
      const total = opts.mostrarPrecos && row.custoTotal > 0 ? row.custoTotal : ''
      const values = mostrarTotalItem
        ? [row.numero, sanitize(row.codigo) || '', sanitize(row.descricao) || '', sanitize(row.unidade) || '', qtde, '', unit, total]
        : [row.numero, sanitize(row.codigo) || '', sanitize(row.descricao) || '', sanitize(row.unidade) || '', qtde, unit, total]
      const r = ws.addRow(values)
      r.height = 15
      r.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
        cell.fill = fill(C.slate50)
        cell.font = { name: 'Calibri', size: 9, bold: false, color: { argb: C.gray700 } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
        cell.border = { top: bdr('thin', C.border), bottom: bdr('thin', C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
        if (c === 5 && typeof cell.value === 'number') cell.numFmt = '#,##0.0000'
        if ((c === cUnit || c === cTotal) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
      })
    } else {
      const indent = '    '.repeat(row.nivel)
      const unit = opts.mostrarPrecos && row.custoUnit > 0 ? row.custoUnit : ''
      const total = opts.mostrarPrecos && row.custoTotal > 0 ? row.custoTotal : ''
      const values = mostrarTotalItem
        ? ['', sanitize(row.codigo) || '', sanitize(indent + row.descricao) || '', sanitize(row.unidade) || '', row.indice > 0 ? row.indice : '', row.quantidadeTotalItem > 0 ? row.quantidadeTotalItem : '', unit, total]
        : ['', sanitize(row.codigo) || '', sanitize(indent + row.descricao) || '', sanitize(row.unidade) || '', row.indice > 0 ? row.indice : '', unit, total]
      const r = ws.addRow(values)
      r.height = 13
      r.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
        cell.fill = fill(C.white)
        cell.font = { name: 'Calibri', size: 8, bold: false, color: { argb: C.insumoFg } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
        cell.border = { top: bdr('thin', C.insumoBdr), bottom: bdr('thin', C.insumoBdr), left: bdr('thin', C.border), right: bdr('thin', C.border) }
        if ((c === cUnit || c === cTotal) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
        if (c === 5 && typeof cell.value === 'number') cell.numFmt = '#,##0.0000'
        if (mostrarTotalItem && c === 6 && typeof cell.value === 'number') cell.numFmt = '#,##0.0000'
      })
    }
  }

  const totalFinal = opts.modo === 'agrupada'
    ? rows.filter((r): r is Extract<PlanilhaAnaliticaRow, { tipo: 'insumo' }> => r.tipo === 'insumo').reduce((s, r) => s + r.custoTotal, 0)
    : (opts.categorias.size > 0 || opts.classesAbc.size > 0) ? totalGeralExibido : data.totalGeral

  const totalValues = mostrarTotalItem
    ? ['', '', 'TOTAL', '', '', '', '', opts.mostrarPrecos ? totalFinal : '']
    : ['', '', 'TOTAL', '', '', '', opts.mostrarPrecos ? totalFinal : '']
  const tRow = ws.addRow(totalValues)
  tRow.height = 20
  tRow.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
    cell.fill = fill(C.slate800)
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: c === 3 ? C.headerFg : C.white } }
    cell.alignment = { horizontal: c >= 5 ? 'right' : c === 3 ? 'right' : 'left', vertical: 'middle' }
    cell.border = { top: bdr('medium', C.slate700), bottom: bdr('thin', C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
    if (c === cTotal && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
  })

  await downloadWorkbook(wb, `${slugFilename(data.orcamento.nome_obra)}${SUFIXOS[opts.modo]}.xlsx`)
}
