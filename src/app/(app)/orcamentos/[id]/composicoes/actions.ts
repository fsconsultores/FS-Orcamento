'use server'

import { createClient } from '@/lib/supabase/server'
import { getComposicoesByOrcamentoDetalhado, calcularCodigosUtilizados } from '@/lib/orcamento'
import type { OrcamentoComposicao } from '@/lib/orcamento'
import type { ComposicaoParaExport } from '@/components/export-composicoes-button'

/**
 * Busca pesada (custo_unitario em cadeia + "usados/não usados" + dados para
 * export) — separada da busca rápida de `page.tsx` (só as composições, sem
 * custo) pra não bloquear a primeira renderização da tela. Chamada em
 * background pela tabela (useEffect ao montar) e sob demanda pelo botão de
 * export — ver plano/memória do porquê dessa divisão.
 */
export async function getComposicoesDetalhadoAction(orcamentoId: string) {
  const supabase = await createClient()
  const sb = supabase as any

  const [{ composicoes, insumosDeComposicao }, { data: estrutura }] = await Promise.all([
    getComposicoesByOrcamentoDetalhado(sb, orcamentoId),
    sb.from('orcamento_estrutura').select('codigo').eq('orcamento_id', orcamentoId).eq('tipo', 'item'),
  ])

  const codigosUtilizados = [...calcularCodigosUtilizados(
    (estrutura ?? []).map((e: { codigo: string | null }) => e.codigo),
    composicoes.map((c: OrcamentoComposicao) => ({ id: c.id, codigo: c.codigo })),
    insumosDeComposicao
  )]

  const custosPorId: Record<string, number> = {}
  for (const c of composicoes) custosPorId[c.id] = c.custo_unitario

  const insumosPorComp: Record<string, ComposicaoParaExport['insumos']> = {}
  for (const ins of insumosDeComposicao) {
    if (!insumosPorComp[ins.composicao_id]) insumosPorComp[ins.composicao_id] = []
    insumosPorComp[ins.composicao_id]!.push({
      codigo: ins.codigo ?? '',
      descricao: ins.descricao ?? '',
      unidade: ins.unidade ?? '',
      custo: ins.custo ?? 0,
      indice: ins.indice ?? 0,
      grupo: ins.grupo ?? null,
    })
  }

  const composicoesParaExport: ComposicaoParaExport[] = composicoes.map((c: OrcamentoComposicao) => ({
    id: c.id,
    codigo: c.codigo,
    descricao: c.descricao,
    unidade: c.unidade,
    custo_unitario: c.custo_unitario,
    insumos: insumosPorComp[c.id] ?? [],
  }))

  return { custosPorId, codigosUtilizados, composicoesParaExport }
}

/**
 * Só os dados de export, pra passar como referência de Server Action direto
 * a `ExportComposicoesButton` (prop `fetchComposicoes`) — Client Components
 * só podem receber uma função de servidor como prop se ela mesma for uma
 * Server Action (ou `.bind()` de uma), não um closure comum que chama uma.
 */
export async function exportComposicoesAction(orcamentoId: string): Promise<ComposicaoParaExport[]> {
  const { composicoesParaExport } = await getComposicoesDetalhadoAction(orcamentoId)
  return composicoesParaExport
}
