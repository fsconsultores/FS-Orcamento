/** DD/MM/AAAA — aceita Date ou string parseável (timestamps). */
export function formatDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleDateString('pt-BR')
}

/** DD/MM (sem ano) — contextos compactos como gráficos e tabelas. */
export function formatDateShort(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/**
 * DD/MM/AAAA a partir de uma coluna DATE pura ('AAAA-MM-DD', sem hora) —
 * faz split manual da string em vez de `new Date(str)`, que trataria como
 * UTC meia-noite e poderia exibir o dia anterior em fusos negativos. Usar
 * sempre para colunas DATE (data_cotacao, data_ref, data_inicio, data_prazo)
 * — nunca formatDate/formatDateShort nelas.
 */
export function formatDateOnly(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const [ano, mes, dia] = isoDate.split('-')
  return `${dia}/${mes}/${ano}`
}
