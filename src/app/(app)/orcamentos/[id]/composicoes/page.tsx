import { createClient } from '@/lib/supabase/server'
import { getComposicoesByOrcamento, calcularCodigosUtilizados } from '@/lib/orcamento'
import { NovaComposicaoForm } from './nova-composicao-form'
import { ComposicoesTable } from './composicoes-table'
import { ExportComposicoesButton } from '@/components/export-composicoes-button'
import { ExportComposicaoModeloButton } from '@/components/export-composicao-modelo-button'
import type { OrcamentoComposicao } from '@/lib/orcamento'
import type { ComposicaoParaExport } from '@/components/export-composicoes-button'

export default async function OrcamentoComposicoesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const sb = supabase as any

  const composicoes = await getComposicoesByOrcamento(sb, orcamentoId)

  const { data: estrutura } = await sb
    .from('orcamento_estrutura')
    .select('codigo')
    .eq('orcamento_id', orcamentoId)
    .eq('tipo', 'item')

  // Insumos dentro de composições, para decompor recursivamente quais códigos
  // (de composições e insumos) estão efetivamente em uso na planilha.
  const insumosDeComposicao: { composicao_id: string | null; codigo: string }[] = []
  {
    const BATCH = 1000
    let start = 0
    while (true) {
      const { data } = await sb
        .from('orcamento_insumos')
        .select('composicao_id, codigo')
        .eq('orcamento_id', orcamentoId)
        .not('composicao_id', 'is', null)
        .range(start, start + BATCH - 1)
      if (!data || data.length === 0) break
      insumosDeComposicao.push(...data)
      if (data.length < BATCH) break
      start += BATCH
    }
  }

  const codigosUtilizados = calcularCodigosUtilizados(
    (estrutura ?? []).map((e: { codigo: string | null }) => e.codigo),
    composicoes.map((c: OrcamentoComposicao) => ({ id: c.id, codigo: c.codigo })),
    insumosDeComposicao
  )

  // Busca insumos de todas as composições para o export (servidor, sem query no cliente)
  const compIds = composicoes.map((c: OrcamentoComposicao) => c.id)
  let insumosPorComp: Record<string, ComposicaoParaExport['insumos']> = {}

  if (compIds.length > 0) {
    const BATCH = 100
    const todosInsumos: { composicao_id: string; codigo: string; descricao: string; unidade: string; custo: number; indice: number }[] = []
    for (let i = 0; i < compIds.length; i += BATCH) {
      const { data } = await sb
        .from('orcamento_insumos')
        .select('composicao_id, codigo, descricao, unidade, custo, indice, grupo')
        .in('composicao_id', compIds.slice(i, i + BATCH))
      for (const ins of data ?? []) {
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
    }
  }

  const composicoesParaExport: ComposicaoParaExport[] = composicoes.map((c: OrcamentoComposicao) => ({
    id: c.id,
    codigo: c.codigo,
    descricao: c.descricao,
    unidade: c.unidade,
    custo_unitario: c.custo_unitario,
    insumos: insumosPorComp[c.id] ?? [],
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Composições do Orçamento</h1>
          <p className="text-sm text-gray-500 mt-1">{composicoes.length} composição(ões)</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportComposicaoModeloButton />
          <ExportComposicoesButton composicoes={composicoesParaExport} />
        </div>
      </div>

      <NovaComposicaoForm orcamentoId={orcamentoId} />

      <ComposicoesTable composicoes={composicoes} orcamentoId={orcamentoId} codigosUtilizados={[...codigosUtilizados]} />
    </div>
  )
}
