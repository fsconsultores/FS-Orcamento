import { cache } from 'react'

export interface QueryStat {
  table: string
  method: string
  durationMs: number
}

/**
 * Lista de queries da requisição atual. `cache()` garante uma única
 * instância de array por requisição (mesmo truque usado para dedupe de
 * dados no restante do app) — cada chamada dentro do mesmo request React
 * recebe o mesmo array, permitindo agregar timing sem precisar de um
 * armazenamento global compartilhado entre requisições/usuários.
 */
export const getQueryStats = cache((): QueryStat[] => [])

export function recordQuery(stat: QueryStat) {
  try {
    getQueryStats().push(stat)
  } catch {
    // fora de um request React (script standalone, etc.) — ignora
  }
}
