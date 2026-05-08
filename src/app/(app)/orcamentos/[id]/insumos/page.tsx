import { createClient } from '@/lib/supabase/server'
import { getInsumosByOrcamento, getComposicoesByOrcamento } from '@/lib/orcamento'
import { NovoInsumoForm } from './novo-insumo-form'
import { OrcamentoInsumosTable } from './insumos-table'

export default async function OrcamentoInsumosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const [insumos, composicoes] = await Promise.all([
    getInsumosByOrcamento(supabase as any, orcamentoId),
    getComposicoesByOrcamento(supabase as any, orcamentoId),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insumos do Orçamento</h1>
          <p className="text-sm text-gray-500 mt-1">{insumos.length} insumo(s)</p>
        </div>
      </div>

      <NovoInsumoForm orcamentoId={orcamentoId} composicoes={composicoes} />

      <OrcamentoInsumosTable initialInsumos={insumos} orcamentoId={orcamentoId} />
    </div>
  )
}
