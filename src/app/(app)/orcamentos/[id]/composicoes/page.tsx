import { createClient } from '@/lib/supabase/server'
import { getComposicoesByOrcamento } from '@/lib/orcamento'
import { NovaComposicaoForm } from './nova-composicao-form'
import { ComposicoesTable } from './composicoes-table'
import { ExportXlsxButton } from '@/components/export-xlsx-button'
import type { OrcamentoComposicao } from '@/lib/orcamento'

export default async function OrcamentoComposicoesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const composicoes = await getComposicoesByOrcamento(supabase as any, orcamentoId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Composições do Orçamento</h1>
          <p className="text-sm text-gray-500 mt-1">{composicoes.length} composição(ões)</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportXlsxButton
            rows={composicoes.map((c: OrcamentoComposicao) => ({
              'Código': c.codigo,
              'Descrição': c.descricao,
              'Unidade': c.unidade,
              'Custo Unitário': c.custo_unitario,
              'Base': c.base ?? '',
            }))}
            sheetName="Composições"
            fileName="composicoes"
          />
        </div>
      </div>

      <NovaComposicaoForm orcamentoId={orcamentoId} />

      <ComposicoesTable composicoes={composicoes} orcamentoId={orcamentoId} />
    </div>
  )
}
