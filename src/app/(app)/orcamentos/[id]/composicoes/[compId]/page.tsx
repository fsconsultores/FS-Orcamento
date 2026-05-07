import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/costs'

export default async function OrcamentoComposicaoDetailPage({
  params,
}: {
  params: Promise<{ id: string; compId: string }>
}) {
  const { id: orcamentoId, compId } = await params
  const sb = (await createClient()) as any

  const { data: composicao, error } = await sb
    .from('orcamento_composicoes')
    .select('*')
    .eq('id', compId)
    .eq('orcamento_id', orcamentoId)
    .single()

  if (error || !composicao) notFound()

  const { data: insumosRaw } = await sb
    .from('orcamento_insumos')
    .select('id, codigo, descricao, unidade, custo, grupo')
    .eq('composicao_id', compId)
    .order('grupo')
    .order('descricao')

  type InsumoRow = {
    id: string
    codigo: string
    descricao: string
    unidade: string
    custo: number
    grupo: string | null
  }

  const insumos = (insumosRaw ?? []) as InsumoRow[]
  const custoTotal = insumos.reduce((s, i) => s + (i.custo ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/orcamentos/${orcamentoId}/composicoes`}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Composições
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{composicao.descricao}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {composicao.codigo} · {composicao.unidade}
            {composicao.base && <> · <span className="text-gray-400">{composicao.base}</span></>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Custo unitário</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(custoTotal)}</p>
          <p className="text-xs text-gray-400">/{composicao.unidade}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-gray-900">
            Insumos{' '}
            <span className="text-sm font-normal text-gray-400">({insumos.length})</span>
          </h2>
        </div>
        {insumos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            Nenhum insumo vinculado a esta composição.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Insumo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Grupo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Unidade</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Custo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {insumos.map((ins) => (
                <tr key={ins.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{ins.codigo || '—'}</td>
                  <td className="px-4 py-3 text-gray-900">{ins.descricao}</td>
                  <td className="px-4 py-3 text-gray-500">{ins.grupo || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{ins.unidade}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatCurrency(ins.custo ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-gray-50">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-right font-semibold text-gray-700">
                  Total
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">
                  {formatCurrency(custoTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
