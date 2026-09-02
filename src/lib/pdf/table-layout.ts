/**
 * Margens e larguras padronizadas para autoTable (100% da área útil em paisagem).
 */
export const PDF_TABLE_MARGIN_LATERAL = 14
export const PDF_TABLE_MARGIN_BOTTOM = 14

/** Margem lateral unificada — alinha banners, KPIs e tabelas na mesma grade. */
export const PDF_PAGE_MARGIN = PDF_TABLE_MARGIN_LATERAL

/** Largura útil da página e das tabelas — A4 paisagem com margens laterais de 14 mm. */
export function pdfContentWidth(pageW: number): number {
  return pageW - PDF_TABLE_MARGIN_LATERAL * 2
}

/** Configuração padrão de autoTable: margens 14 mm + largura 100% da área útil. */
export function pdfTableLayout(pageW: number, opts?: { bottom?: number; top?: number }) {
  return {
    margin: pdfAutoTableMargins(opts),
    tableWidth: pdfContentWidth(pageW),
  }
}

/** Margens idênticas em todas as chamadas autoTable. */
export function pdfAutoTableMargins(opts?: { bottom?: number; top?: number }) {
  return {
    left: PDF_TABLE_MARGIN_LATERAL,
    right: PDF_TABLE_MARGIN_LATERAL,
    bottom: opts?.bottom ?? PDF_TABLE_MARGIN_BOTTOM,
    ...(opts?.top != null ? { top: opts.top } : {}),
  }
}

/** Resumo Geral — (A) Detalhamento: Item | Descrição | Valor | % */
export function resumoDetalhamentoColumnStyles(_contentW: number) {
  const itemW = 12
  const valorW = 58
  const pctW = 36
  return {
    0: { cellWidth: itemW, halign: 'center' as const, minCellWidth: itemW, overflow: 'hidden' as const },
    1: { cellWidth: 'auto' as const, halign: 'left' as const, overflow: 'linebreak' as const, minCellWidth: 36, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 } },
    2: { cellWidth: valorW, halign: 'center' as const, minCellWidth: valorW, overflow: 'hidden' as const },
    3: { cellWidth: pctW, halign: 'center' as const, minCellWidth: pctW, overflow: 'hidden' as const },
  }
}

/** Resumo Geral — (B) Serviços Estimados — mesma grade da tabela (A). */
export function resumoServicosColumnStyles(contentW: number) {
  return resumoDetalhamentoColumnStyles(contentW)
}

/** @deprecated Use resumoDetalhamentoColumnStyles ou resumoServicosColumnStyles */
export function resumoValorColumnStyles(contentW: number) {
  return resumoServicosColumnStyles(contentW)
}

/** Planilha Analítica (8 colunas fixas do Caderno). */
export function planilhaAnaliticaCadernoColumnStyles(_contentW: number) {
  const item = 14
  const codigo = 16
  const und = 12
  const indice = 20
  const unit = 28
  const total = 28
  const abc = 10
  return {
    0: { cellWidth: item, halign: 'center' as const, minCellWidth: item, overflow: 'hidden' as const },
    1: { cellWidth: codigo, halign: 'center' as const, minCellWidth: codigo, overflow: 'hidden' as const },
    2: { cellWidth: 'auto' as const, halign: 'left' as const, overflow: 'linebreak' as const, minCellWidth: 36, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 } },
    3: { cellWidth: und, halign: 'center' as const, minCellWidth: und },
    4: { cellWidth: indice, halign: 'center' as const, minCellWidth: indice },
    5: { cellWidth: unit, halign: 'center' as const, minCellWidth: unit },
    6: { cellWidth: total, halign: 'center' as const, minCellWidth: total },
    7: { cellWidth: abc, halign: 'center' as const, minCellWidth: abc },
  }
}

/** Planilha Sintética avulsa — 7 colunas. */
export function planilhaSinteticaColumnStyles(contentW: number) {
  const item = 18
  const codigo = 26
  const und = 18
  const qtde = 24
  const unit = 30
  const total = 30
  return {
    0: { cellWidth: item, halign: 'center' as const, minCellWidth: item },
    1: { cellWidth: codigo, halign: 'center' as const, minCellWidth: codigo },
    2: { cellWidth: 'auto' as const, halign: 'left' as const, overflow: 'linebreak' as const, minCellWidth: 40 },
    3: { cellWidth: und, halign: 'center' as const, minCellWidth: und },
    4: { cellWidth: qtde, halign: 'center' as const, minCellWidth: qtde },
    5: { cellWidth: unit, halign: 'center' as const, minCellWidth: unit },
    6: { cellWidth: total, halign: 'center' as const, minCellWidth: total },
  }
}

/** Planilha de Preços Unitários — variantes com/sem BDI; coluna Descrição absorve o restante. */
export function planilhaPrecosColumnStyles(_contentW: number, temBdi: boolean) {
  const item = 14
  const codigo = 16
  const money = {
    halign: 'center' as const,
    overflow: 'hidden' as const,
    minCellWidth: 26,
    cellPadding: 1,
  }
  const descricaoBase = {
    cellWidth: 'auto' as const,
    halign: 'left' as const,
    overflow: 'linebreak' as const,
    minCellWidth: 32,
    cellPadding: { top: 1, bottom: 1, left: 2, right: 1 },
  }

  if (temBdi) {
    // Variante com BDI tem 3 colunas a mais (BDI%, Preço de Venda Unitário/Total)
    // que a variante sem BDI — sem enxugar as demais, elas tomavam ~63mm extras
    // da largura fixa e empurravam Descrição pro minCellWidth (32mm), forçando
    // a descrição de todo item a quebrar em várias linhas empilhadas (bug real,
    // comparado visualmente: mesmo orçamento com/sem BDI configurado).
    return {
      0: { cellWidth: 12, halign: 'center' as const, minCellWidth: 12, overflow: 'hidden' as const, cellPadding: 1 },
      1: { cellWidth: 14, halign: 'center' as const, minCellWidth: 14, overflow: 'hidden' as const, cellPadding: 1 },
      2: { ...descricaoBase, minCellWidth: 42 },
      3: { cellWidth: 9, halign: 'center' as const, minCellWidth: 9, overflow: 'hidden' as const, cellPadding: 1 },
      4: { cellWidth: 12, halign: 'center' as const, minCellWidth: 12, overflow: 'hidden' as const, cellPadding: 1 },
      5: { cellWidth: 19, ...money },
      6: { cellWidth: 17, ...money },
      7: { cellWidth: 19, ...money },
      8: { cellWidth: 19, ...money },
      9: { cellWidth: 21, ...money },
      10: { cellWidth: 10, halign: 'center' as const, minCellWidth: 10, overflow: 'hidden' as const, cellPadding: 1 },
      11: { cellWidth: 19, ...money },
      12: { cellWidth: 21, ...money },
      13: { cellWidth: 10, halign: 'center' as const, minCellWidth: 10, overflow: 'hidden' as const, cellPadding: 1 },
      14: { cellWidth: 8, halign: 'center' as const, minCellWidth: 8, overflow: 'hidden' as const, cellPadding: 1 },
    }
  }

  const pct = 13
  const abc = 10
  return {
    0: { cellWidth: item, halign: 'center' as const, minCellWidth: item, overflow: 'hidden' as const, cellPadding: 1 },
    1: { cellWidth: codigo, halign: 'center' as const, minCellWidth: codigo, overflow: 'hidden' as const, cellPadding: 1 },
    2: descricaoBase,
    3: { cellWidth: 11, halign: 'center' as const, minCellWidth: 11, overflow: 'hidden' as const, cellPadding: 1 },
    4: { cellWidth: 16, halign: 'center' as const, minCellWidth: 16, overflow: 'hidden' as const, cellPadding: 1 },
    5: { cellWidth: 24, ...money },
    6: { cellWidth: 22, ...money },
    7: { cellWidth: 24, ...money },
    8: { cellWidth: 24, ...money },
    9: { cellWidth: 26, ...money },
    10: { cellWidth: pct, halign: 'center' as const, minCellWidth: pct, overflow: 'hidden' as const, cellPadding: 1 },
    11: { cellWidth: abc, halign: 'center' as const, minCellWidth: abc, overflow: 'hidden' as const, cellPadding: 1 },
  }
}

/** fontSize reduzido para a 2ª linha do cabeçalho (Mat/Equip, M.O., Terceiros). */
export const PDF_PRECOS_HEAD_SUBROW_FONT = 6
