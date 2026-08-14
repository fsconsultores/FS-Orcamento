'use server'

import { createClient } from '@/lib/supabase/server'
import { getInsumosByOrcamentoDetalhado, getComposicoesBasico, calcularCodigosUtilizados, getSugestoesCotacaoCrossOrcamento } from '@/lib/orcamento'
import type { OrcamentoInsumo, SugestaoCotacao } from '@/lib/orcamento'

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

  const [{ insumos: insumosCompletos, insumosDeComposicao }, composicoes, { data: estrutura }] = await Promise.all([
    getInsumosByOrcamentoDetalhado(sb, orcamentoId),
    getComposicoesBasico(sb, orcamentoId),
    sb.from('orcamento_estrutura').select('codigo').eq('orcamento_id', orcamentoId).eq('tipo', 'item'),
  ])

  const codigosUtilizados = [...calcularCodigosUtilizados(
    (estrutura ?? []).map((e: { codigo: string | null }) => e.codigo),
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
