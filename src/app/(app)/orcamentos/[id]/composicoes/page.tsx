import { createClient } from '@/lib/supabase/server'
import { getComposicoesByOrcamento } from '@/lib/orcamento'
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

      <ComposicoesTable composicoes={composicoes} orcamentoId={orcamentoId} />
    </div>
  )
}
