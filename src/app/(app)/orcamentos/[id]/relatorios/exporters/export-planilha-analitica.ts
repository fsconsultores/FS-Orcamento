import type { CadernoData, PlanilhaAnaliticaRow, AbcClasse } from '@/lib/orcamento/caderno'
import { filterAnaliticaRows, buildAgrupadaRows, type CategoriaAnalitica } from '@/lib/orcamento/analitica-filtros'
import { sanitize, XLSX_COLORS as C, xlsxFill as fill, xlsxBorder as bdr, addSheetHeader, downloadWorkbook, slugFilename } from './xlsx-shared'
import { formatDateOnly } from '@/lib/format-date'

export type AnaliticaModo = 'normal' | 'decomposta' | 'agrupada'

export interface AnaliticaFilterState {
  modo: AnaliticaModo
  categorias: Set<CategoriaAnalitica>
  classesAbc: Set<AbcClasse>
  // Controla tanto o VALOR quanto a PRESENÇA das colunas "R$ Unit."/"R$ Total"
  // — desligado, elas somem do export (não ficam em branco), pra quem só
  // quer o consumo físico de insumo por item (índice × quantidade do item,
  // ver quantidadeTotalItem) sem nenhuma coluna de preço.
  mostrarPrecos: boolean
  // Opções da Gestão de Cotações — cada uma independente, default desligada
  // (não muda o formato do export pra quem não pediu).
  exibirFornecedor: boolean
  exibirDataCotacao: boolean
  exibirObservacoesCotacao: boolean
}

export function defaultAnaliticaFilterState(): AnaliticaFilterState {
  return {
    modo: 'normal', categorias: new Set(), classesAbc: new Set(), mostrarPrecos: true,
    exibirFornecedor: false, exibirDataCotacao: false, exibirObservacoesCotacao: false,
  }
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

// Exportados (não só locais) pra export-planilha-analitica-pdf.ts reaproveitar
// os mesmos títulos/sufixos/formatação — mesmo relatório, dois formatos.
export const TITULOS: Record<AnaliticaModo, string> = {
  normal: 'PLANILHA ANALÍTICA DE PREÇOS UNITÁRIOS',
  decomposta: 'PLANILHA ANALÍTICA DECOMPOSTA',
  agrupada: 'PLANILHA ANALÍTICA AGRUPADA POR TIPO DE INSUMO',
}

export const SUFIXOS: Record<AnaliticaModo, string> = {
  normal: '_analitica',
  decomposta: '_analitica_decomposta',
  agrupada: '_analitica_agrupada',
}

// data_cotacao é DATE puro ('AAAA-MM-DD') — evita passar por new Date() e
// arriscar deslocar de fuso.
export function fmtDataCotacao(dataIso: string | null | undefined): string {
  if (!dataIso) return ''
  return formatDateOnly(dataIso)
}

// Mantém uma célula fora do array quando `incluir` é false — em vez de uma
// pilha de ternários por combinação de mostrarTotalItem × mostrarPrecos,
// cada coluna opcional declara sua própria condição uma vez só.
function linha(...celulas: [boolean, unknown][]): unknown[] {
  return celulas.filter(([incluir]) => incluir).map(([, valor]) => valor)
}

export async function exportPlanilhaAnaliticaXlsx(data: CadernoData, opts: AnaliticaFilterState) {
  const rows = buildAnaliticaRows(data, opts)
  // "Total no Item" (índice × quantidade do item na planilha) só faz sentido nos
  // modos Normal/Decomposta — no Agrupado a coluna "Qtde" já é o total do
  // orçamento inteiro, mostrar as duas seria redundante.
  const mostrarTotalItem = opts.modo !== 'agrupada'
  const mostrarPrecos = opts.mostrarPrecos

  // Posição (1-based, mesma indexação do `c` do eachCell) de cada coluna
  // opcional, calculada uma vez — usada só pra formatação/alinhamento.
  let col = 5 // 1:Item 2:Código 3:Descrição 4:Und 5:Qtde/Índice
  const cTotalItem = mostrarTotalItem ? ++col : null
  const cUnit = mostrarPrecos ? ++col : null
  const cTotal = mostrarPrecos ? ++col : null
  const ultimaColPrincipal = col

  const extraCols: { header: string; width: number; get: (row: PlanilhaAnaliticaRow) => string }[] = []
  if (opts.exibirFornecedor) extraCols.push({ header: 'Fornecedor', width: 20, get: r => r.tipo === 'insumo' ? sanitize(r.fornecedor ?? '') || '' : '' })
  if (opts.exibirDataCotacao) extraCols.push({ header: 'Data Cotação', width: 13, get: r => r.tipo === 'insumo' ? fmtDataCotacao(r.dataCotacao) : '' })
  if (opts.exibirObservacoesCotacao) extraCols.push({ header: 'Observações', width: 32, get: r => r.tipo === 'insumo' ? sanitize(r.observacoes ?? '') || '' : '' })

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'FS Orçamento'
  const ws = wb.addWorksheet('Planilha Analítica')

  // Descrição absorve a largura das colunas opcionais que sumiram — cheia
  // (8 colunas) fica em 48; sem preço e sem total-no-item (5 colunas, só
  // "consumo físico") fica bem mais larga.
  const descricaoWidth = mostrarTotalItem && mostrarPrecos ? 48 : mostrarTotalItem || mostrarPrecos ? 55 : 65

  ws.columns = [
    ...linha(
      [true, { width: 10 }], [true, { width: 13 }],
      [true, { width: descricaoWidth }],
      [true, { width: 6 }], [true, { width: 11 }],
      [mostrarTotalItem, { width: 13 }], [mostrarPrecos, { width: 15 }], [mostrarPrecos, { width: 16 }],
    ),
    ...extraCols.map(c => ({ width: c.width })),
  ] as any

  await addSheetHeader(wb, ws, TITULOS[opts.modo], data.orcamento)

  const headers = [
    ...linha(
      [true, 'Item'], [true, 'Código'], [true, 'Descrição'], [true, 'Und'],
      [true, mostrarTotalItem ? 'Qtde/Índice' : 'Qtde'],
      [mostrarTotalItem, 'Total no Item'], [mostrarPrecos, 'R$ Unit.'], [mostrarPrecos, 'R$ Total'],
    ),
    ...extraCols.map(c => c.header),
  ]
  const hRow = ws.addRow(headers)
  hRow.height = 20
  hRow.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
    cell.fill = fill(C.headerBg)
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.headerFg } }
    cell.alignment = { horizontal: c >= 5 && c <= ultimaColPrincipal ? 'right' : 'left', vertical: 'middle' }
    cell.border = { top: bdr('medium', C.borderDk), bottom: bdr('medium', C.borderDk), left: bdr('thin', C.border), right: bdr('thin', C.border) }
  })

  let totalGeralExibido = 0

  for (const row of rows) {
    const extraValues = extraCols.map(c => c.get(row))
    if (row.tipo === 'grupo') {
      const values = [
        ...linha(
          [true, row.numero], [true, ''], [true, sanitize(row.descricao) || ''], [true, ''], [true, ''],
          [mostrarTotalItem, ''], [mostrarPrecos, ''], [mostrarPrecos, ''],
        ),
        ...extraValues,
      ]
      const r = ws.addRow(values)
      r.height = 18
      r.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
        cell.fill = fill(C.slate800)
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } }
        cell.alignment = { horizontal: c >= 5 && c <= ultimaColPrincipal ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('thin', C.borderDk), bottom: bdr('thin', C.borderDk), left: bdr('thin', C.border), right: bdr('thin', C.border) }
      })
    } else if (row.tipo === 'item') {
      totalGeralExibido += row.custoTotal
      const qtde = row.quantidade > 0 ? row.quantidade : ''
      const unit = mostrarPrecos && row.custoUnitario > 0 ? row.custoUnitario : ''
      const total = mostrarPrecos && row.custoTotal > 0 ? row.custoTotal : ''
      const values = [
        ...linha(
          [true, row.numero], [true, sanitize(row.codigo) || ''], [true, sanitize(row.descricao) || ''], [true, sanitize(row.unidade) || ''], [true, qtde],
          [mostrarTotalItem, ''], [mostrarPrecos, unit], [mostrarPrecos, total],
        ),
        ...extraValues,
      ]
      const r = ws.addRow(values)
      r.height = 15
      r.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
        cell.fill = fill(C.slate50)
        cell.font = { name: 'Calibri', size: 9, bold: false, color: { argb: C.gray700 } }
        cell.alignment = { horizontal: c >= 5 && c <= ultimaColPrincipal ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
        cell.border = { top: bdr('thin', C.border), bottom: bdr('thin', C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
        if (c === 5 && typeof cell.value === 'number') cell.numFmt = '#,##0.0000'
        if ((c === cUnit || c === cTotal) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
      })
    } else {
      const indent = '    '.repeat(row.nivel)
      const unit = mostrarPrecos && row.custoUnit > 0 ? row.custoUnit : ''
      const total = mostrarPrecos && row.custoTotal > 0 ? row.custoTotal : ''
      const values = [
        ...linha(
          [true, ''], [true, sanitize(row.codigo) || ''], [true, sanitize(indent + row.descricao) || ''], [true, sanitize(row.unidade) || ''],
          [true, row.indice > 0 ? row.indice : ''],
          [mostrarTotalItem, row.quantidadeTotalItem > 0 ? row.quantidadeTotalItem : ''], [mostrarPrecos, unit], [mostrarPrecos, total],
        ),
        ...extraValues,
      ]
      const r = ws.addRow(values)
      r.height = 13
      r.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
        cell.fill = fill(C.white)
        cell.font = { name: 'Calibri', size: 8, bold: false, color: { argb: C.insumoFg } }
        cell.alignment = { horizontal: c >= 5 && c <= ultimaColPrincipal ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
        cell.border = { top: bdr('thin', C.insumoBdr), bottom: bdr('thin', C.insumoBdr), left: bdr('thin', C.border), right: bdr('thin', C.border) }
        if ((c === cUnit || c === cTotal) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
        if (c === 5 && typeof cell.value === 'number') cell.numFmt = '#,##0.0000'
        if (c === cTotalItem && typeof cell.value === 'number') cell.numFmt = '#,##0.0000'
      })
    }
  }

  const totalFinal = opts.modo === 'agrupada'
    ? rows.filter((r): r is Extract<PlanilhaAnaliticaRow, { tipo: 'insumo' }> => r.tipo === 'insumo').reduce((s, r) => s + r.custoTotal, 0)
    : (opts.categorias.size > 0 || opts.classesAbc.size > 0) ? totalGeralExibido : data.totalGeral

  const totalValues = [
    ...linha(
      [true, ''], [true, ''], [true, 'TOTAL'], [true, ''], [true, ''],
      [mostrarTotalItem, ''], [mostrarPrecos, ''], [mostrarPrecos, totalFinal],
    ),
    ...extraCols.map(() => ''),
  ]
  const tRow = ws.addRow(totalValues)
  tRow.height = 20
  tRow.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
    cell.fill = fill(C.slate800)
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: c === 3 ? C.headerFg : C.white } }
    cell.alignment = { horizontal: c >= 5 && c <= ultimaColPrincipal ? 'right' : c === 3 ? 'right' : 'left', vertical: 'middle' }
    cell.border = { top: bdr('medium', C.slate700), bottom: bdr('thin', C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
    if (c === cTotal && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
  })

  await downloadWorkbook(wb, `${slugFilename(data.orcamento.nome_obra)}${SUFIXOS[opts.modo]}.xlsx`)
}
