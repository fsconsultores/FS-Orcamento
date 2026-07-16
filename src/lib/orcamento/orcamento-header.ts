import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface OrcamentoHeader {
  id: string
  nome_obra: string
  codigo: string | null
  cliente: string | null
  bdi_global: number
  data: string | null
}

/**
 * Cabeçalho do orçamento (nome, código, cliente, bdi, data), usado tanto pelo
 * layout (breadcrumb/subnav, em toda navegação entre abas) quanto pela página
 * raiz de /orcamentos/[id]. Memoizado por requisição (React cache) para que,
 * quando os dois renderizam na mesma navegação, a consulta rode uma vez só.
 */
export const getOrcamentoHeaderCached = cache(async (orcamentoId: string): Promise<OrcamentoHeader | null> => {
  const supabase = (await createClient()) as any
  const { data } = await supabase
    .from('tabela_orcamentos')
    .select('id, nome_obra, codigo, cliente, bdi_global, data')
    .eq('id', orcamentoId)
    .single()
  return data ?? null
})
