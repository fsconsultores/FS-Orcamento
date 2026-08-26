'use server'

import { createClient } from '@/lib/supabase/server'
import { getInsumosByOrcamentoDetalhado, getComposicoesBasico, calcularCodigosUtilizados, getSugestoesCotacaoCrossOrcamento } from '@/lib/orcamento'
import type { OrcamentoInsumo, SugestaoCotacao } from '@/lib/orcamento'
import { fetchAllPaginatedParallel } from '@/lib/orcamento/paginate'

/**
 * Fatia lenta da tela de Insumos — separada da busca rápida de `page.tsx`
 * (só os avulsos, que já têm custo/fornecedor próprios e não dependem de
 * mais nada) pra não bloquear a primeira renderização. Cobre três pontos
 * caros: insumos embutidos em composições sem avulso equivalente (entram na
 * tabela com custo=0), o filtro "usados/não utilizados" (precisam do
 * vínculo composição→insumos) e as sugestões de preço cross-obra (busca
 * cross-orçamento em lotes de 200 códigos — chega a dezenas de requisições
 * em paralelo em orçamentos com muitos avulsos sem preço). Chamada em
 * background pela tabela (useEffect ao montar).
 */
export async function getInsumosDetalhadoAction(orcamentoId: string) {
  const supabase = await createClient()
  const sb = supabase as any

  const [{ insumos: insumosCompletos, insumosDeComposicao }, composicoes, estrutura] = await Promise.all([
    getInsumosByOrcamentoDetalhado(sb, orcamentoId),
    getComposicoesBasico(sb, orcamentoId),
    fetchEstruturaCodigos(sb, orcamentoId),
  ])

  const codigosUtilizados = [...calcularCodigosUtilizados(
    estrutura.map((e) => e.codigo),
    composicoes.map((c) => ({ id: c.id, codigo: c.codigo })),
    insumosDeComposicao
  )]

  const codigosSemPreco = insumosCompletos
    .filter((i) => i.composicao_id === null && i.custo === 0)
    .map((i) => i.codigo)
  const sugestoesMap = await getSugestoesCotacaoCrossOrcamento(sb, orcamentoId, codigosSemPreco)
  const sugestoes: Record<string, SugestaoCotacao> = Object.fromEntries(sugestoesMap)

  return { insumosCompletos: insumosCompletos as OrcamentoInsumo[], codigosUtilizados, sugestoes }
}

export interface PreviaLimpezaNaoUtilizados {
  avulsos: { id: string; codigo: string; descricao: string }[]
  composicoes: { id: string; codigo: string; descricao: string }[]
}

/**
 * Levanta o que entraria numa limpeza de "não utilizados" sem apagar nada
 * ainda — usado pra montar o modal de confirmação com a contagem exata
 * antes do usuário decidir. Cobre os dois jeitos de um insumo ficar "não
 * utilizado": avulso sem uso (composicao_id null) e insumo só existindo
 * embutido numa composição que também não é usada (não dá pra remover só o
 * insumo embutido sem mexer na composição — por isso a composição inteira
 * entra na lista aqui).
 */
export async function previewLimparNaoUtilizadosAction(orcamentoId: string): Promise<PreviaLimpezaNaoUtilizados> {
  const supabase = await createClient()
  const sb = supabase as any

  const [{ insumosDeComposicao }, composicoes, estrutura, avulsosAtuais] = await Promise.all([
    getInsumosByOrcamentoDetalhado(sb, orcamentoId),
    getComposicoesBasico(sb, orcamentoId),
    fetchEstruturaCodigos(sb, orcamentoId),
    fetchAllPaginatedParallel<{ id: string; codigo: string; descricao: string }>(
      (from, to) =>
        sb
          .from('orcamento_insumos')
          .select('id, codigo, descricao', { count: 'exact' })
          .eq('orcamento_id', orcamentoId)
          .is('composicao_id', null)
          .range(from, to)
    ),
  ])

  const usadosSet = calcularCodigosUtilizados(
    estrutura.map((e) => e.codigo),
    composicoes.map((c) => ({ id: c.id, codigo: c.codigo })),
    insumosDeComposicao
  )

  return {
    avulsos: avulsosAtuais.filter((i) => !usadosSet.has(i.codigo)),
    composicoes: composicoes.filter((c) => !usadosSet.has(c.codigo)).map((c) => ({ id: c.id, codigo: c.codigo, descricao: c.descricao })),
  }
}

function fetchEstruturaCodigos(sb: any, orcamentoId: string) {
  return fetchAllPaginatedParallel<{ codigo: string | null }>(
    (from, to) =>
      sb
        .from('orcamento_estrutura')
        .select('codigo', { count: 'exact' })
        .eq('orcamento_id', orcamentoId)
        .eq('tipo', 'item')
        .range(from, to)
  )
}

/**
 * Executa a limpeza — recebe os IDs exatos já mostrados no modal de
 * confirmação (não recalcula "quem está não utilizado" de novo agora, pra
 * garantir que o que o usuário confirmou é exatamente o que é apagado).
 * Ordem importa: insumos embutidos nas composições primeiro (composicao_id
 * é ON DELETE SET NULL — apagar a composição direto os transformaria em
 * avulsos órfãos em vez de sumir), depois as composições, depois os
 * avulsos. Tudo em lotes de 100 (um .in() com centenas de UUIDs de uma vez
 * estoura o limite de tamanho de URL do PostgREST).
 */
export async function executarLimparNaoUtilizadosAction(
  orcamentoId: string,
  avulsoIds: string[],
  composicaoIds: string[]
): Promise<{ avulsosRemovidos: number; composicoesRemovidas: number }> {
  const supabase = await createClient()
  const sb = supabase as any

  for (let i = 0; i < composicaoIds.length; i += 100) {
    const { error } = await sb.from('orcamento_insumos').delete().in('composicao_id', composicaoIds.slice(i, i + 100))
    if (error) throw new Error(`Erro ao remover insumos embutidos: ${error.message}`)
  }
  for (let i = 0; i < composicaoIds.length; i += 100) {
    const { error } = await sb
      .from('orcamento_composicoes')
      .delete()
      .eq('orcamento_id', orcamentoId)
      .in('id', composicaoIds.slice(i, i + 100))
    if (error) throw new Error(`Erro ao remover composições: ${error.message}`)
  }
  for (let i = 0; i < avulsoIds.length; i += 100) {
    const { error } = await sb
      .from('orcamento_insumos')
      .delete()
      .eq('orcamento_id', orcamentoId)
      .in('id', avulsoIds.slice(i, i + 100))
    if (error) throw new Error(`Erro ao remover insumos avulsos: ${error.message}`)
  }

  return { avulsosRemovidos: avulsoIds.length, composicoesRemovidas: composicaoIds.length }
}
