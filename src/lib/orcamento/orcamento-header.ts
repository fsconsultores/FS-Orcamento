import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface OrcamentoHeader {
  id: string
  nome_obra: string
  codigo: string | null
  cliente: string | null
  bdi_global: number
  data: string | null
  /** Posição desta revisão na família (1 = primeira) e quantas a família tem
   * ao todo — alimenta o indicador "Revisão N de M" no layout, visível em
   * toda a navegação do orçamento. 1/1 quando a família é solo (ou quando a
   * migração de revisões ainda não rodou nesse banco). */
  numeroRevisao: number
  totalRevisoes: number
}

async function buscarInfoRevisao(supabase: any, orcamentoId: string): Promise<{ numeroRevisao: number; totalRevisoes: number }> {
  // Best-effort e em query separada da essencial (abaixo) de propósito: se
  // falhar (ex.: migração 20260828000000_orcamento_revisoes.sql ainda não
  // aplicada nesse banco — grupo_id/numero_revisao não existem), cai pra
  // 1/1 em vez de derrubar o cabeçalho inteiro (e, com ele, todo /orcamentos/[id]/*).
  try {
    const { data: rev, error } = await supabase
      .from('tabela_orcamentos')
      .select('grupo_id, numero_revisao')
      .eq('id', orcamentoId)
      .single()
    if (error || !rev?.grupo_id) return { numeroRevisao: 1, totalRevisoes: 1 }

    const { count } = await supabase
      .from('tabela_orcamentos')
      .select('id', { count: 'exact', head: true })
      .eq('grupo_id', rev.grupo_id)

    return { numeroRevisao: rev.numero_revisao ?? 1, totalRevisoes: count ?? 1 }
  } catch {
    return { numeroRevisao: 1, totalRevisoes: 1 }
  }
}

/**
 * Cabeçalho do orçamento (nome, código, cliente, bdi, data, posição na
 * família de revisões), usado tanto pelo layout (breadcrumb/subnav, em toda
 * navegação entre abas) quanto pela página raiz de /orcamentos/[id].
 * Memoizado por requisição (React cache) para que, quando os dois renderizam
 * na mesma navegação, a consulta rode uma vez só.
 */
export const getOrcamentoHeaderCached = cache(async (orcamentoId: string): Promise<OrcamentoHeader | null> => {
  const supabase = (await createClient()) as any

  const [{ data }, revisaoInfo] = await Promise.all([
    supabase
      .from('tabela_orcamentos')
      .select('id, nome_obra, codigo, cliente, bdi_global, data')
      .eq('id', orcamentoId)
      .single(),
    buscarInfoRevisao(supabase, orcamentoId),
  ])
  if (!data) return null

  return {
    id: data.id,
    nome_obra: data.nome_obra,
    codigo: data.codigo,
    cliente: data.cliente,
    bdi_global: data.bdi_global,
    data: data.data,
    numeroRevisao: revisaoInfo.numeroRevisao,
    totalRevisoes: revisaoInfo.totalRevisoes,
  }
})
