'use client'

import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { ACAO_LABELS, ACAO_COLORS } from '@/lib/historico-labels'
import { PageHeader } from '@/components/ui/toolbar'
import { EmptyState } from '@/components/ui/empty-state'
import { Timeline, TimelineItem, type TimelineTone } from '@/components/ui/timeline'
import { ScrollText, CheckCircle2, XCircle, Activity } from 'lucide-react'

function tonForAcao(acao: string): { tone: TimelineTone; icon: typeof Activity } {
  if (/erro|excluir/.test(acao)) return { tone: 'error', icon: XCircle }
  if (/criar|duplicar|criada|restaurada|salvas?/.test(acao)) return { tone: 'success', icon: CheckCircle2 }
  return { tone: 'neutral', icon: Activity }
}

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
      <PageHeader
        title="Histórico do Orçamento"
        description={logs.length === 0 ? 'Nenhum registro ainda.' : `${logs.length} registro(s)`}
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar na mensagem…"
          defaultValue={filtroQ}
          onKeyDown={e => { if (e.key === 'Enter') updateFilter('q', (e.target as HTMLInputElement).value.trim()) }}
          onBlur={e => updateFilter('q', e.target.value.trim())}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 w-56"
        />
        <select
          value={filtroAcao}
          onChange={e => updateFilter('acao', e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
        >
          <option value="">Todas as ações</option>
          {acoesUnicas.map(a => (
            <option key={a} value={a}>{ACAO_LABELS[a] ?? a}</option>
          ))}
        </select>
        {(filtroAcao || filtroQ) && (
          <Link
            href={pathname as any}
            className="text-sm font-medium text-primary-700 hover:underline"
          >
            Limpar filtros
          </Link>
        )}
      </div>

      {/* Timeline */}
      {logs.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <EmptyState
            icon={<ScrollText size={20} />}
            title="Nenhum log encontrado"
            description="Ajuste os filtros ou a busca para ver outros eventos deste orçamento."
          />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <Timeline>
            {logs.map((log, i) => {
              const { tone, icon: Icon } = tonForAcao(log.acao)
              return (
                <TimelineItem key={log.id} icon={<Icon size={14} />} tone={tone} isLast={i === logs.length - 1}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-xs text-gray-400 font-mono tabular-nums">
                      {new Date(log.created_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ACAO_COLORS[log.acao] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ACAO_LABELS[log.acao] ?? log.acao}
                    </span>
                    <span className="text-xs text-gray-400">{log.usuario_email ?? '—'}</span>
                    <span className="text-xs text-gray-400">· {log.orcamento_planilhas?.nome ?? (log.planilha_id ? '—' : 'Projeto')}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-800">{log.mensagem}</p>
                  {log.valor_anterior && log.valor_novo && (
                    <p className="mt-0.5 text-xs text-gray-500">
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
                </TimelineItem>
              )
            })}
          </Timeline>
        </div>
      )}
    </div>
  )
}
