import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

const ORIGEM_LABEL: Record<string, string> = {
  manual:     'Edição manual',
  cotacao:    'Importação de cotação',
  sinapi:     'Importação SINAPI',
  dnit:       'Importação DNIT',
  sudecap:    'Importação SUDECAP',
  der:        'Importação DER',
  importacao: 'Importação',
}

function fmt(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function HistoricoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sb = await createClient() as any

  const [insumoRes, histRes] = await Promise.all([
    sb.from('tabela_insumos').select('codigo, descricao').eq('id', id).single(),
    sb
      .from('tabela_historico_precos')
      .select('id, preco_anterior, preco_novo, origem, observacao, usuario, created_at')
      .eq('insumo_id', id)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  if (insumoRes.error || !insumoRes.data) notFound()

  const insumo = insumoRes.data as { codigo: string; descricao: string }
  const historico = (histRes.data ?? []) as {
    id: string
    preco_anterior: number | null
    preco_novo: number
    origem: string
    observacao: string | null
    usuario: string | null
    created_at: string
  }[]

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{insumo.descricao}</h1>
        <p className="text-sm text-gray-500 font-mono mt-0.5">{insumo.codigo}</p>
      </div>

      {historico.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-400">Nenhuma alteração de preço registrada.</p>
          <p className="text-xs text-gray-300 mt-1">O histórico é gravado a partir de agora em cada edição.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-40">Data</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 w-32">Preço anterior</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 w-32">Preço novo</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 w-24">Variação</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Origem</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Usuário</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {historico.map(h => {
                const anterior = h.preco_anterior ?? 0
                const diff = h.preco_novo - anterior
                const pct = anterior > 0 ? (diff / anterior) * 100 : null
                return (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600 tabular-nums text-xs">{fmtDate(h.created_at)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                      {h.preco_anterior != null ? fmt(h.preco_anterior) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">
                      {fmt(h.preco_novo)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums text-xs font-medium ${
                      diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      {pct != null
                        ? `${diff > 0 ? '+' : ''}${pct.toFixed(1)}%`
                        : h.preco_anterior == null ? 'novo' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">
                      {ORIGEM_LABEL[h.origem] ?? h.origem}
                      {h.observacao && (
                        <span className="ml-1.5 text-gray-400 text-xs">· {h.observacao}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs truncate max-w-[160px]">
                      {h.usuario ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {historico.length === 200 && (
            <div className="px-4 py-2.5 border-t bg-gray-50 text-xs text-gray-400 text-center">
              Exibindo as 200 alterações mais recentes
            </div>
          )}
        </div>
      )}
    </div>
  )
}
