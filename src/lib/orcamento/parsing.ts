/**
 * Utilitários de parsing compartilhados entre orcamento-tree e orcamento-grid.
 * Fonte única de verdade — alterações aqui propagam para todos os importadores.
 */

export type NivelItem = 'grupo' | 'composicao' | 'insumo'

/**
 * Converte string ou número para number.
 * Suporta formato BR com separador de milhar: "1.500,50" → 1500.50
 * Suporta decimal com vírgula: "4,5" → 4.5
 * Retorna 0 para valores ausentes ou inválidos.
 */
export function parseNumero(value: number | string | undefined): number {
  if (value === undefined || value === null || value === '') return 0
  if (typeof value === 'number') return isNaN(value) ? 0 : value

  const s = String(value).trim()
  if (!s) return 0

  if (s.includes(',')) {
    // Formato BR: ponto = milhar, vírgula = decimal → "1.500,50" → 1500.50
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  }

  // Sem vírgula: verifica se ponto é separador de milhar (exatamente 3 dígitos após)
  const lastDot = s.lastIndexOf('.')
  if (lastDot !== -1 && s.length - lastDot - 1 === 3 && !s.slice(0, lastDot).includes('.')) {
    return parseFloat(s.replace('.', '')) || 0
  }

  return parseFloat(s) || 0
}

/**
 * Versão que retorna undefined em vez de 0 para valores inválidos/ausentes.
 * Usada em contextos onde null/undefined tem significado semântico distinto de 0.
 */
export function parseNumeroOpcional(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return isNaN(value) ? undefined : value
  const n = parseFloat(String(value).replace(',', '.'))
  return isNaN(n) ? undefined : n
}

/**
 * Infere nível pela contagem de segmentos do código hierárquico.
 * "001" → grupo | "001.001" → composição | undefined/vazio → insumo
 *
 * ATENÇÃO: só usar quando `nivel` não está definido e o código segue o padrão
 * hierárquico (001, 001.001). Códigos de catálogo (CZ200002) exigem `nivel` explícito.
 */
export function inferirNivel(codigo: string | undefined): NivelItem {
  const s = codigo?.trim()
  if (!s) return 'insumo'
  return s.split('.').filter(Boolean).length === 1 ? 'grupo' : 'composicao'
}
