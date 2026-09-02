/**
 * Tabela da Lista de Insumos — colunas fixas; estilos via globalTableStyles.
 */
import type { jsPDF } from 'jspdf'
import type { RowInput } from 'jspdf-autotable'
import { fmt, fmtQtd } from '@/lib/curva-abc'
import type { ListaInsumoItem } from '@/lib/orcamento/caderno'
import { globalTableStyles } from './global-table-styles'
import { pdfTableLayout } from './table-layout'
import type { standardHeaderAutoTableHooks } from './standard-header'

export const LISTA_INSUMOS_HEADERS = [
  'Grupo',
  'Código',
  'Descrição',
  'Und',
  'Quantidade',
  'Preço (R$)',
  'Total (R$)',
] as const

export function listaInsumosColumnStyles(contentW: number) {
  const grupo = 28
  const codigo = 22
  const und = 12
  const quantidade = 24
  const preco = 26
  const total = 26

  return {
    0: { cellWidth: grupo, halign: 'left' as const, overflow: 'linebreak' as const, minCellWidth: 28 },
    1: { cellWidth: codigo, halign: 'center' as const, minCellWidth: codigo },
    2: { cellWidth: 'auto' as const, halign: 'left' as const, overflow: 'linebreak' as const, minCellWidth: 40 },
    3: { cellWidth: und, halign: 'center' as const, minCellWidth: und },
    4: { cellWidth: quantidade, halign: 'center' as const, minCellWidth: quantidade },
    5: { cellWidth: preco, halign: 'center' as const, minCellWidth: preco },
    6: { cellWidth: total, halign: 'center' as const, minCellWidth: total },
  }
}

export function buildListaInsumosRow(item: ListaInsumoItem): string[] {
  return [
    String(item.grupo ?? ''),
    String(item.codigo ?? ''),
    String(item.descricao ?? ''),
    String(item.unidade ?? ''),
    fmtQtd(item.quantidade),
    fmt(item.custo),
    fmt(item.total),
  ]
}

export function buildListaInsumosBody(items: ListaInsumoItem[]): string[][] {
  return items.map(buildListaInsumosRow)
}

export function buildListaInsumosFoot(totalGrupo: number): RowInput[] {
  return [['', '', '', '', '', 'TOTAL DO GRUPO', fmt(totalGrupo)]]
}

type HeaderHooks = ReturnType<typeof standardHeaderAutoTableHooks>

export async function drawListaInsumosGrupoTable(
  doc: jsPDF,
  pageW: number,
  startY: number,
  items: ListaInsumoItem[],
  opts?: { headerHooks?: HeaderHooks },
): Promise<number> {
  const { autoTable } = await import('jspdf-autotable')
  const tableLayout = pdfTableLayout(pageW)
  const totalGrupo = items.reduce((s, i) => s + i.total, 0)

  autoTable(doc, {
    startY,
    tableWidth: tableLayout.tableWidth,
    margin: opts?.headerHooks?.margin ?? tableLayout.margin,
    didDrawPage: opts?.headerHooks?.didDrawPage,
    head: [LISTA_INSUMOS_HEADERS.slice()],
    body: buildListaInsumosBody(items),
    foot: buildListaInsumosFoot(totalGrupo),
    showFoot: 'lastPage',
    ...globalTableStyles,
    columnStyles: listaInsumosColumnStyles(tableLayout.tableWidth),
  })

  // @ts-expect-error lastAutoTable injetado em runtime
  return doc.lastAutoTable.finalY
}
