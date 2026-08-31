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
   * migração de revisões/a RPC de header ainda não rodaram nesse banco). */
  numeroRevisao: number
  totalRevisoes: number
}

/**
 * Cabeçalho do orçamento (nome, código, cliente, bdi, data, posição na
 * família de revisões), usado tanto pelo layout (breadcrumb/subnav, em toda
 * navegação entre abas) quanto pela página raiz de /orcamentos/[id].
 * Memoizado por requisição (React cache) para que, quando os dois renderizam
 * na mesma navegação, a consulta rode uma vez só.
 *
 * Performance (retomada da auditoria de junho-agosto/2026 — a alavanca certa
 * neste ambiente é reduzir NÚMERO DE ROUND-TRIPS, não latência por query,
 * já que até um select de 1 linha já custa 200ms-1s+ aqui): 1 única chamada
 * RPC (get_orcamento_header_completo) busca cabeçalho + numero_revisao +
 * contagem da família de revisões numa consulta só — antes eram 2-3
 * round-trips sequenciais em TODA navegação de TODA aba de TODO orçamento,
 * não só quando havia revisões. Sem a RPC ainda aplicada nesse banco
 * (migração nova), cai pro cabeçalho essencial via select direto — ainda 1
 * round-trip, só sem o indicador de revisão (nunca pior do que antes desta
 * otimização existir).
 */
export const getOrcamentoHeaderCached = cache(async (orcamentoId: string): Promise<OrcamentoHeader | null> => {
  const supabase = (await createClient()) as any

  const { data, error } = await supabase
    .rpc('get_orcamento_header_completo', { p_orcamento_id: orcamentoId })
    .maybeSingle()

  if (!error && data) {
    return {
      id: orcamentoId,
      nome_obra: data.nome_obra,
      codigo: data.codigo,
      cliente: data.cliente,
      bdi_global: data.bdi_global,
      data: data.data,
      numeroRevisao: data.numero_revisao ?? 1,
      totalRevisoes: data.total_revisoes ?? 1,
    }
  }

  const { data: basico } = await supabase
    .from('tabela_orcamentos')
    .select('id, nome_obra, codigo, cliente, bdi_global, data')
    .eq('id', orcamentoId)
    .single()
  if (!basico) return null

  return {
    id: basico.id,
    nome_obra: basico.nome_obra,
    codigo: basico.codigo,
    cliente: basico.cliente,
    bdi_global: basico.bdi_global,
    data: basico.data,
    numeroRevisao: 1,
    totalRevisoes: 1,
  }
})
