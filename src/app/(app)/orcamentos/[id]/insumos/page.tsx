import { createClient } from '@/lib/supabase/server'
import { getInsumosByOrcamento, getComposicoesByOrcamento } from '@/lib/orcamento'
import { NovoInsumoForm } from './novo-insumo-form'
import type { OrcamentoInsumo } from '@/lib/orcamento'

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insumos do Orçamento</h1>
          <p className="text-sm text-gray-500 mt-1">{insumos.length} insumo(s)</p>
        </div>
      </div>

      <NovoInsumoForm orcamentoId={orcamentoId} composicoes={composicoes} />

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3 text-right">Custo</th>
              <th className="px-4 py-3">Grupo</th>
              <th className="px-4 py-3">Base</th>
              <th className="px-4 py-3">Data Ref.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {insumos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Nenhum insumo cadastrado neste orçamento.
                </td>
              </tr>
            ) : (
              insumos.map((insumo: OrcamentoInsumo) => (
                <tr key={insumo.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{insumo.codigo}</td>
                  <td className="px-4 py-3">{insumo.descricao}</td>
                  <td className="px-4 py-3 text-gray-500">{insumo.unidade}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {insumo.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{insumo.grupo ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{insumo.base ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{insumo.data_ref ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
