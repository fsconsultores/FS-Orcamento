/**
 * Converte um texto numérico pra number sem assumir de antemão qual
 * separador (`,` ou `.`) é o decimal — decide pelo que aparece MAIS À
 * DIREITA na string, que é sempre o separador decimal (o de milhar nunca
 * aparece depois dele, em nenhuma convenção real). Resolve corretamente os
 * dois formatos que aparecem nos importadores deste sistema:
 * - BR ("1.650,62" ou "650,62"): milhar = ponto, decimal = vírgula.
 * - Internacional / `XLSX.utils.sheet_to_csv` ("1,650.62" ou "650.62"):
 *   milhar = vírgula, decimal = ponto — é o formato que o SheetJS usa pra
 *   converter uma célula numérica de volta pra texto, independente do
 *   idioma/formato de exibição da planilha original.
 *
 * Achado real: um .xlsx que nasceu de uma conversão de .csv guarda a célula
 * de custo como TEXTO já em ponto-decimal (célula não foi reconhecida como
 * numérica); um parser que assume "todo texto é BR" e remove todo ponto
 * incondicionalmente transforma "650.62" em 65062 e "650.620" em 650620.
 * Só ambíguo no caso raro de 1 separador único sem decimal nenhum (ex.:
 * "1.650" representando exatamente mil seiscentos e cinquenta) — nesse caso
 * mantém o mesmo comportamento de sempre tratar como decimal (não dá pra
 * saber com certeza sem mais contexto).
 */
export function parseLocaleNumber(raw: string): number {
  const lastComma = raw.lastIndexOf(',')
  const lastDot = raw.lastIndexOf('.')
  if (lastComma === -1 && lastDot === -1) return parseFloat(raw) || 0
  if (lastComma > lastDot) return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(raw.replace(/,/g, '')) || 0
}
