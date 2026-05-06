import { createClient } from '@/lib/supabase/server'
import { getComposicoesByOrcamento } from '@/lib/orcamento'
import { NovaComposicaoForm } from './nova-composicao-form'
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Composições do Orçamento</h1>
          <p className="text-sm text-gray-500 mt-1">{composicoes.length} composição(ões)</p>
        </div>
      </div>

      <NovaComposicaoForm orcamentoId={orcamentoId} />

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3 text-right">
                Custo Unitário
                <span className="ml-1 font-normal normal-case text-gray-400">(calculado)</span>
              </th>
              <th className="px-4 py-3">Base</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {composicoes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Nenhuma composição cadastrada neste orçamento.
                </td>
              </tr>
            ) : (
              composicoes.map((c: OrcamentoComposicao) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{c.codigo}</td>
                  <td className="px-4 py-3">{c.descricao}</td>
                  <td className="px-4 py-3 text-gray-500">{c.unidade}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    {c.custo_unitario > 0
                      ? c.custo_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.base ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
