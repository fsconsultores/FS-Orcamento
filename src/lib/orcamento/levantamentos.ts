import type { SupabaseClient } from '@supabase/supabase-js'

export type LevantamentoStatus = 'nao_iniciado' | 'em_andamento' | 'concluido' | 'com_pendencia' | 'bloqueado'
export type PendenciaStatus = 'aberta' | 'resolvida'

export interface LevantamentoItem {
  id: string
  levantamento_id: string
  descricao: string
  concluido: boolean
  ordem: number
  created_at: string
}

export interface LevantamentoPendencia {
  id: string
  levantamento_id: string
  item: string | null
  problema: string
  pergunta: string | null
  status: PendenciaStatus
  usuario: string | null
  resolvida_em: string | null
  created_at: string
}

export interface Levantamento {
  id: string
  orcamento_id: string
  nome: string
  responsavel: string | null
  status: LevantamentoStatus
  data_inicio: string | null
  data_prazo: string | null
  ordem: number
  created_at: string
  itens: LevantamentoItem[]
  pendencias: LevantamentoPendencia[]
}

/**
 * Lista padrão de áreas/disciplinas de levantamento — seeded em orçamentos
 * novos criados em branco (não a partir de modelo, que já traz a estrutura
 * clonada do modelo). Configurável depois: só o ponto de partida.
 */
export const LEVANTAMENTOS_PADRAO = [
  'Arquitetura',
  'Alvenaria',
  'Esquadrias',
  'Revestimento Interno',
  'Revestimento Externo',
  'Pisos',
  'Pintura',
  'Forros',
  'Fundação',
  'Contenção',
  'Estrutura',
  'Armação',
  'Instalações',
] as const

export async function seedLevantamentosPadrao(supabase: SupabaseClient, orcamentoId: string): Promise<void> {
  const sb = supabase as any
  const rows = LEVANTAMENTOS_PADRAO.map((nome, ordem) => ({ orcamento_id: orcamentoId, nome, ordem }))
  const { error } = await sb.from('orcamento_levantamentos').insert(rows)
  if (error) throw new Error(`Erro ao criar levantamentos padrão: ${error.message}`)
}

/**
 * Busca levantamentos + itens de checklist + pendências de um orçamento numa
 * consulta só (aninhada via PostgREST) — a tela mostra tudo de uma vez
 * (accordion por área, sem navegação pra subpágina).
 */
export async function getLevantamentosByOrcamento(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<Levantamento[]> {
  const sb = supabase as any
  const { data, error } = await sb
    .from('orcamento_levantamentos')
    .select(`
      id, orcamento_id, nome, responsavel, status, data_inicio, data_prazo, ordem, created_at,
      itens:orcamento_levantamento_itens(id, levantamento_id, descricao, concluido, ordem, created_at),
      pendencias:orcamento_levantamento_pendencias(id, levantamento_id, item, problema, pergunta, status, usuario, resolvida_em, created_at)
    `)
    .eq('orcamento_id', orcamentoId)
    .order('ordem')
  if (error) throw new Error(`Erro ao buscar levantamentos: ${error.message}`)

  const levantamentos = (data ?? []) as Levantamento[]
  for (const l of levantamentos) {
    l.itens.sort((a, b) => a.ordem - b.ordem)
    l.pendencias.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  return levantamentos
}
