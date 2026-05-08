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
    .select('id, codigo, descricao, unidade, custo, indice, grupo')
    .eq('composicao_id', compId)
    .order('grupo')
    .order('descricao')

  type InsumoRow = {
    id: string
    codigo: string
    descricao: string
    unidade: string
    custo: number
    indice: number
    grupo: string | null
  }

  const insumosBase = (insumosRaw ?? []) as InsumoRow[]

  // Resolve custo efetivo por código: avulso → composição filha → valor armazenado
  const codigos = insumosBase.map((i) => i.codigo).filter(Boolean)
  const precoMap = new Map<string, number>()

  // 1. Avulsos
  for (let i = 0; i < codigos.length; i += 500) {
    const { data: avs } = await sb
      .from('orcamento_insumos')
      .select('codigo, custo')
      .eq('orcamento_id', orcamentoId)
      .is('composicao_id', null)
      .in('codigo', codigos.slice(i, i + 500))
    for (const av of (avs ?? []) as { codigo: string; custo: number }[]) {
      precoMap.set(av.codigo, av.custo)
    }
  }

  // 2. Composições filhas (tipo C): calcula custo_unitario delas para os códigos sem avulso
  const codigosSemPreco = codigos.filter((c) => !precoMap.has(c))
  if (codigosSemPreco.length > 0) {
    const { data: childComps } = await sb
      .from('orcamento_composicoes')
      .select('id, codigo')
      .eq('orcamento_id', orcamentoId)
      .in('codigo', codigosSemPreco)

    if (childComps?.length) {
      const childIds = (childComps as { id: string; codigo: string }[]).map((c) => c.id)
      const { data: childIns } = await sb
        .from('orcamento_insumos')
        .select('composicao_id, codigo, custo, indice')
        .in('composicao_id', childIds)

      // Avulsos dos insumos das composições filhas
      const childCodigos = [...new Set((childIns ?? []).map((i: any) => i.codigo).filter(Boolean))]
      const childAvulsoMap = new Map<string, number>()
      for (let i = 0; i < childCodigos.length; i += 500) {
        const { data: avs } = await sb
          .from('orcamento_insumos')
          .select('codigo, custo')
          .eq('orcamento_id', orcamentoId)
          .is('composicao_id', null)
          .in('codigo', childCodigos.slice(i, i + 500))
        for (const av of (avs ?? []) as { codigo: string; custo: number }[]) {
          childAvulsoMap.set(av.codigo, av.custo)
        }
      }

      for (const comp of childComps as { id: string; codigo: string }[]) {
        const seus = (childIns ?? []).filter((i: any) => i.composicao_id === comp.id)
        const custo = seus.reduce((s: number, i: any) => {
          const c = childAvulsoMap.has(i.codigo) ? childAvulsoMap.get(i.codigo)! : (i.custo ?? 0)
          return s + c * (i.indice ?? 1)
        }, 0)
        precoMap.set(comp.codigo, custo)
      }
    }
  }

  const insumos = insumosBase.map((ins) => ({
    ...ins,
    custo: precoMap.has(ins.codigo) ? precoMap.get(ins.codigo)! : ins.custo,
  }))

  const custoTotal = insumos.reduce((s, i) => s + (i.custo ?? 0) * (i.indice ?? 1), 0)

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
                <th className="px-4 py-3 text-right font-medium text-gray-600">Preço unit.</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Índice</th>
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
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatCurrency(ins.custo ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                    {(ins.indice ?? 1).toLocaleString('pt-BR', { maximumFractionDigits: 6 })}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatCurrency((ins.custo ?? 0) * (ins.indice ?? 1))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-gray-50">
              <tr>
                <td colSpan={6} className="px-4 py-3 text-right font-semibold text-gray-700">
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
