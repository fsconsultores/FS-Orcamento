import { createClient } from '@/lib/supabase/server'
import { getComposicoesBasico } from '@/lib/orcamento'
import { ComposicoesTable } from './composicoes-table'
import { DevProfiler } from '@/components/dev-profiler'
import { ExportComposicoesButton } from '@/components/export-composicoes-button'
import { ExportComposicaoModeloButton } from '@/components/export-composicao-modelo-button'
import { exportComposicoesAction } from './actions'

export default async function OrcamentoComposicoesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const sb = supabase as any

  // Busca só as composições (rápida mesmo em orçamentos com milhares de
  // linhas) — custo_unitario, "usados/não usados" e os dados de export
  // dependem do grafo completo (composições podem referenciar outras em
  // cadeia) e são carregados à parte, em background, sem bloquear esta
  // renderização. Ver getComposicoesDetalhadoAction.
  const composicoes = await getComposicoesBasico(sb, orcamentoId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Composições do Orçamento</h1>
          <p className="text-sm text-gray-500 mt-1">{composicoes.length} composição(ões)</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportComposicaoModeloButton />
          <ExportComposicoesButton fetchComposicoes={exportComposicoesAction.bind(null, orcamentoId)} />
        </div>
      </div>

      <DevProfiler id="ComposicoesTable">
        <ComposicoesTable composicoes={composicoes} orcamentoId={orcamentoId} />
      </DevProfiler>
    </div>
  )
}
