import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Para cada código em `codigos`, conta em quantos ORÇAMENTOS DISTINTOS ele
 * aparece — em orcamento_insumos (avulso ou embutido em composição) e em
 * orcamento_composicoes. RLS de ambas as tabelas é domain-wide (ver
 * 20260724000000_orcamentos_visiveis_dominio.sql) — a contagem reflete a
 * empresa inteira, não só os orçamentos do usuário logado, consistente com
 * a Curva ABC Geral e com getSugestoesCotacaoCrossOrcamento. Sempre em lote
 * via `.in('codigo', chunk)` (nunca uma query por item) — mesmo idioma já
 * estabelecido no projeto para evitar N+1 sob a latência alta de round-trip
 * observada na auditoria de performance.
 */
export async function contarUsoEmOrcamentos(
  supabase: SupabaseClient,
  codigos: string[]
): Promise<Map<string, number>> {
  if (codigos.length === 0) return new Map()
  const sb = supabase as any

  const BATCH = 200
  const lotes: string[][] = []
  for (let i = 0; i < codigos.length; i += BATCH) lotes.push(codigos.slice(i, i + BATCH))

  const [insumoResultados, composicaoResultados] = await Promise.all([
    Promise.all(lotes.map((chunk) =>
      sb.from('orcamento_insumos').select('codigo, orcamento_id').in('codigo', chunk).is('deleted_at', null)
    )),
    Promise.all(lotes.map((chunk) =>
      sb.from('orcamento_composicoes').select('codigo, orcamento_id').in('codigo', chunk).is('deleted_at', null)
    )),
  ])

  const porCodigo = new Map<string, Set<string>>()
  for (const { data, error } of [...insumoResultados, ...composicaoResultados]) {
    if (error) throw new Error(`Erro ao contar uso em orçamentos: ${error.message}`)
    for (const row of (data ?? []) as { codigo: string; orcamento_id: string }[]) {
      const set = porCodigo.get(row.codigo) ?? new Set<string>()
      set.add(row.orcamento_id)
      porCodigo.set(row.codigo, set)
    }
  }

  const resultado = new Map<string, number>()
  for (const [codigo, set] of porCodigo) resultado.set(codigo, set.size)
  return resultado
}
