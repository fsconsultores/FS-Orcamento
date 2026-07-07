'use client'

import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { ACAO_LABELS, ACAO_COLORS } from '@/lib/historico-labels'

type LogRow = {
  id: string
  planilha_id: string | null
  usuario_email: string | null
  acao: string
  entidade: string | null
  mensagem: string
  valor_anterior: Record<string, unknown> | null
  valor_novo: Record<string, unknown> | null
  detalhes: Record<string, unknown> | null
  created_at: string
  orcamento_planilhas: { nome: string } | null
}

function fmtValor(v: Record<string, unknown>): string {
  const entries = Object.entries(v)
  if (entries.length === 1) return String(entries[0][1])
  return entries.map(([k, val]) => `${k}: ${val}`).join(', ')
}

interface Props {
  orcamentoId: string
  logs: LogRow[]
  filtroAcao: string
  filtroQ: string
}

export function LogsView({ orcamentoId, logs, filtroAcao, filtroQ }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`${pathname}?${params.toString()}` as any)
  }, [router, pathname, sp])

  const acoesUnicas = [...new Set(logs.map(l => l.acao))].sort()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Histórico do Orçamento</h1>
        <p className="text-sm text-gray-500 mt-1">
          {logs.length === 0 ? 'Nenhum registro ainda.' : `${logs.length} registro(s)`}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar na mensagem…"
          defaultValue={filtroQ}
          onKeyDown={e => { if (e.key === 'Enter') updateFilter('q', (e.target as HTMLInputElement).value.trim()) }}
          onBlur={e => updateFilter('q', e.target.value.trim())}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
        />
        <select
          value={filtroAcao}
          onChange={e => updateFilter('acao', e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todas as ações</option>
          {acoesUnicas.map(a => (
            <option key={a} value={a}>{ACAO_LABELS[a] ?? a}</option>
          ))}
        </select>
        {(filtroAcao || filtroQ) && (
          <Link
            href={pathname as any}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Limpar filtros
          </Link>
        )}
      </div>

      {/* Tabela */}
      {logs.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-14 text-center">
          <p className="text-sm text-gray-400">Nenhum log encontrado.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Data/hora</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Ação</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Usuário</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Planilha</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Mensagem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap tabular-nums">
                    {new Date(log.created_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ACAO_COLORS[log.acao] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ACAO_LABELS[log.acao] ?? log.acao}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {log.usuario_email ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {log.orcamento_planilhas?.nome ?? (log.planilha_id ? '—' : 'Projeto')}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 max-w-md">
                    <span>{log.mensagem}</span>
                    {log.valor_anterior && log.valor_novo && (
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        de <span className="font-medium text-gray-700">{fmtValor(log.valor_anterior)}</span>
                        {' '}para <span className="font-medium text-gray-700">{fmtValor(log.valor_novo)}</span>
                      </p>
                    )}
                    {log.detalhes && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[10px] text-gray-400 hover:text-gray-600">detalhes</summary>
                        <pre className="mt-1 rounded bg-gray-100 px-2 py-1 text-[10px] text-gray-600 overflow-x-auto">
                          {JSON.stringify(log.detalhes, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
