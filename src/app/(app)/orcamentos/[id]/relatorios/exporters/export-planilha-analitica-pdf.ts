import type { RowInput } from 'jspdf-autotable'
import type { CadernoData, PlanilhaAnaliticaRow, AbcClasse } from '@/lib/orcamento/caderno'
import { fmt, fmtQtd } from '@/lib/curva-abc'
import { PDF_COLORS } from '@/lib/pdf/abc-section'
import { slugFilename } from './xlsx-shared'
import { buildAnaliticaRows, TITULOS, SUFIXOS, fmtDataCotacao, type AnaliticaFilterState } from './export-planilha-analitica'
import { formatDate } from '@/lib/format-date'

const ABC_BG: Record<AbcClasse, string> = { A: '#dcfce7', B: '#fef3c7', C: '#fee2e2' }
const ABC_FG: Record<AbcClasse, string> = { A: '#15803d', B: '#b45309', C: '#b91c1c' }

// Mantém uma célula fora da linha quando `incluir` é false — mesma ideia do
// helper `linha()` da versão XLSX deste relatório, pra não empilhar
// ternários por combinação de mostrarTotalItem × mostrarPrecos.
function linha(...celulas: [boolean, string | number][]): (string | number)[] {
  return celulas.filter(([incluir]) => incluir).map(([, valor]) => valor)
}

/**
 * Mesmo conteúdo de exportPlanilhaAnaliticaXlsx (mesmo modo/filtros/opções
 * de cotação, via buildAnaliticaRows — nenhuma lógica de linhas duplicada),
 * só que em PDF. Layout de banner standalone, igual a curva-abc/export-pdf.ts
 * e export-planilha-sintetica-pdf.ts.
 */
export async function exportPlanilhaAnaliticaPdf(data: CadernoData, opts: AnaliticaFilterState) {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')

  const rows = buildAnaliticaRows(data, opts)
  const mostrarTotalItem = opts.modo !== 'agrupada'
  const mostrarPrecos = opts.mostrarPrecos

  const extraCols: { header: string; get: (row: PlanilhaAnaliticaRow) => string }[] = []
  if (opts.exibirFornecedor) extraCols.push({ header: 'Fornecedor', get: r => r.tipo === 'insumo' ? (r.fornecedor ?? '') : '' })
  if (opts.exibirDataCotacao) extraCols.push({ header: 'Data Cotação', get: r => r.tipo === 'insumo' ? fmtDataCotacao(r.dataCotacao) : '' })
  if (opts.exibirObservacoesCotacao) extraCols.push({ header: 'Observações', get: r => r.tipo === 'insumo' ? (r.observacoes ?? '') : '' })

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 10
  const contentW = pageW - margin * 2

  doc.setFillColor(PDF_COLORS.bannerBg)
  doc.rect(margin, margin, contentW, 16, 'F')
  doc.setTextColor(PDF_COLORS.bannerFg)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(TITULOS[opts.modo], margin + 4, margin + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const subtitle = [
    [data.orcamento.codigo, data.orcamento.nome_obra].filter(Boolean).join(' - '),
    `Gerado em ${formatDate(new Date())}`,
  ].filter(Boolean).join('   •   ')
  doc.text(subtitle, margin + 4, margin + 12.5)

  const headers = [
    ...linha(
      [true, 'Item'], [true, 'Código'], [true, 'Descrição'], [true, 'Und'], [true, mostrarTotalItem ? 'Qtde/Índice' : 'Qtde'],
      [mostrarTotalItem, 'Total no Item'], [mostrarPrecos, 'R$ Unit.'], [mostrarPrecos, 'R$ Total'],
    ),
    ...extraCols.map(c => c.header),
  ]
  const numCols = headers.length

  let totalGeralExibido = 0

  const body: RowInput[] = rows.map(row => {
    const extraValues = extraCols.map(c => c.get(row))
    if (row.tipo === 'grupo') {
      return [{
        content: `${row.numero}   ${row.descricao}`,
        colSpan: numCols,
        styles: { fillColor: PDF_COLORS.bannerBg, textColor: '#ffffff', fontStyle: 'bold', halign: 'left' as const },
      }]
    }
    if (row.tipo === 'item') {
      totalGeralExibido += row.custoTotal
      const qtde = row.quantidade > 0 ? fmtQtd(row.quantidade) : ''
      const unit = mostrarPrecos && row.custoUnitario > 0 ? fmt(row.custoUnitario) : ''
      const total = mostrarPrecos && row.custoTotal > 0 ? fmt(row.custoTotal) : ''
      return [
        ...linha(
          [true, row.numero], [true, row.codigo], [true, row.descricao], [true, row.unidade], [true, qtde],
          [mostrarTotalItem, ''], [mostrarPrecos, unit], [mostrarPrecos, total],
        ),
        ...extraValues,
      ]
    }
    const indent = '   '.repeat(row.nivel)
    const unit = mostrarPrecos && row.custoUnit > 0 ? fmt(row.custoUnit) : ''
    const total = mostrarPrecos && row.custoTotal > 0 ? fmt(row.custoTotal) : ''
    return [
      ...linha(
        [true, ''], [true, row.codigo], [true, indent + row.descricao], [true, row.unidade],
        [true, row.indice > 0 ? row.indice.toLocaleString('pt-BR', { maximumFractionDigits: 6 }) : ''],
        [mostrarTotalItem, row.quantidadeTotalItem > 0 ? fmtQtd(row.quantidadeTotalItem) : ''], [mostrarPrecos, unit], [mostrarPrecos, total],
      ),
      ...extraValues,
    ]
  })

  const totalFinal = opts.modo === 'agrupada'
    ? rows.filter((r): r is Extract<PlanilhaAnaliticaRow, { tipo: 'insumo' }> => r.tipo === 'insumo').reduce((s, r) => s + r.custoTotal, 0)
    : (opts.categorias.size > 0 || opts.classesAbc.size > 0) ? totalGeralExibido : data.totalGeral

  const totalCol = mostrarPrecos ? numCols - extraCols.length - 1 : -1
  const footRow = headers.map((_, i) => (i === 2 ? 'TOTAL' : i === totalCol ? fmt(totalFinal) : ''))

  // Colunas fixas (Item/Código/Und/Qtde/[Total no Item]/[R$ Unit./R$ Total]/extras) —
  // Descrição absorve o espaço restante, mesmo padrão de largura explícita
  // por coluna já usado nas outras seções de PDF deste projeto.
  const larguraFixas = 14 + 20 + 12 + 18 + (mostrarTotalItem ? 22 : 0) + (mostrarPrecos ? 26 + 26 : 0) + extraCols.length * 24
  const columnStyles: Record<number, { cellWidth: number; halign?: 'right' | 'center' }> = {
    0: { cellWidth: 14, halign: 'center' },
    1: { cellWidth: 20 },
    2: { cellWidth: Math.max(40, contentW - larguraFixas) },
    3: { cellWidth: 12, halign: 'center' },
    4: { cellWidth: 18, halign: 'right' },
  }
  let col = 5
  if (mostrarTotalItem) columnStyles[col++] = { cellWidth: 22, halign: 'right' }
  if (mostrarPrecos) {
    columnStyles[col++] = { cellWidth: 26, halign: 'right' }
    columnStyles[col++] = { cellWidth: 26, halign: 'right' }
  }
  for (let i = 0; i < extraCols.length; i++) columnStyles[col++] = { cellWidth: 24 }

  autoTable(doc, {
    startY: margin + 16 + 6,
    margin: { left: margin, right: margin, bottom: margin },
    head: [headers],
    body,
    foot: [footRow],
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    styles: { fontSize: 6.5, cellPadding: 1, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
    headStyles: { fillColor: PDF_COLORS.bannerBg, textColor: '#ffffff', fontStyle: 'bold', halign: 'center', fontSize: 7 },
    footStyles: { fillColor: '#f1f5f9', textColor: '#1e293b', fontStyle: 'bold', halign: 'right', lineWidth: 0.1 },
    columnStyles,
    didParseCell: (cellData) => {
      if (cellData.section !== 'body') return
      const row = rows[cellData.row.index]
      if (!row || row.tipo === 'grupo') return
      if (row.tipo === 'item') {
        cellData.cell.styles.fillColor = '#e2e8f0'
        cellData.cell.styles.fontStyle = 'bold'
        if (cellData.column.index === 0 && row.classeAbc) {
          cellData.cell.styles.fillColor = ABC_BG[row.classeAbc]
          cellData.cell.styles.textColor = ABC_FG[row.classeAbc]
        }
        return
      }
      if (row.estimado) {
        cellData.cell.styles.fillColor = '#fef3c7'
        cellData.cell.styles.textColor = '#92400e'
        cellData.cell.styles.fontStyle = 'bold'
      }
    },
  })

  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text(`Página ${p} de ${pageCount}`, pageW - margin, pageH - 4, { align: 'right' })
  }

  doc.save(`${slugFilename(data.orcamento.nome_obra)}${SUFIXOS[opts.modo]}.pdf`)
}
