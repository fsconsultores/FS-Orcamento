import type { SupabaseClient } from '@supabase/supabase-js'

export interface RevisaoResumo {
  id: string
  nome_obra: string
  codigo: string | null
  numero_revisao: number
  criado_em: string
  ultimo_acesso: string | null
  autor_email: string | null
  ehAtual: boolean
}

/**
 * Todas as revisões da família de `orcamentoId` (mesmo grupo_id), da mais
 * antiga pra mais nova — o que a aba Revisões lista. `ehAtual` marca a
 * revisão de maior numero_revisao (a "ponta" da família), calculado aqui em
 * vez de persistido: uma flag booleana precisaria ser atualizada toda vez
 * que uma revisão nova nasce, e sairia de sincronia na primeira falha
 * parcial — MAX(numero_revisao) nunca fica desatualizado.
 */
export async function listarRevisoes(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<RevisaoResumo[]> {
  const sb = supabase as any

  const { data: atual, error: errAtual } = await sb
    .from('tabela_orcamentos')
    .select('grupo_id')
    .eq('id', orcamentoId)
    .single()
  if (errAtual || !atual) throw new Error(`Orçamento não encontrado: ${errAtual?.message ?? ''}`)

  const { data: revisoes, error } = await sb
    .from('tabela_orcamentos')
    .select('id, nome_obra, codigo, numero_revisao, created_at, ultimo_acesso, criado_por_email')
    .eq('grupo_id', atual.grupo_id)
    .order('numero_revisao', { ascending: true })
  if (error) throw new Error(`Erro ao listar revisões: ${error.message}`)

  const rows = (revisoes ?? []) as { id: string; nome_obra: string; codigo: string | null; numero_revisao: number; created_at: string; ultimo_acesso: string | null; criado_por_email: string | null }[]
  if (rows.length === 0) return []

  const maiorNumero = Math.max(...rows.map(r => r.numero_revisao))

  return rows.map(r => ({
    id: r.id,
    nome_obra: r.nome_obra,
    codigo: r.codigo,
    numero_revisao: r.numero_revisao,
    criado_em: r.created_at,
    ultimo_acesso: r.ultimo_acesso,
    // NULL pra todo orçamento criado antes desta migração — sem como saber
    // retroativamente quem criou. Revisões novas sempre têm o e-mail.
    autor_email: r.criado_por_email,
    ehAtual: r.numero_revisao === maiorNumero,
  }))
}
