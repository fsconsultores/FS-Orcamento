'use client'

import { useState, useMemo } from 'react'

export type LogRow = {
  id: string
  created_at: string
  empresa: string
  usuario: string
  tipo: 'info' | 'sucesso' | 'erro'
  acao: string
  mensagem: string
  contexto: Record<string, unknown> | null
}

const TIPO_CONFIG: Record<LogRow['tipo'], { label: string; row: string; badge: string; dot: string }> = {
  info: {
    label: 'Info',
    row: 'border-l-gray-300 bg-white',
    badge: 'bg-gray-100 text-gray-600',
    dot: 'bg-gray-400',
  },
  sucesso: {
    label: 'Sucesso',
    row: 'border-l-green-400 bg-green-50',
    badge: 'bg-green-100 text-green-700',
    dot: 'bg-green-500',
  },
  erro: {
    label: 'Erro',
    row: 'border-l-red-400 bg-red-50',
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
  },
}

const FILTROS = [
  { value: '' as const, label: 'Todos' },
  { value: 'sucesso' as const, label: 'Sucesso' },
  { value: 'info' as const, label: 'Info' },
  { value: 'erro' as const, label: 'Erro' },
]

export function LogsList({ initialLogs }: { initialLogs: LogRow[] }) {
  const [filtroTipo, setFiltroTipo] = useState<'' | LogRow['tipo']>('')
  const [busca, setBusca] = useState('')

  const logs = useMemo(() => {
    return initialLogs.filter((log) => {
      if (filtroTipo && log.tipo !== filtroTipo) return false
      if (busca.trim()) {
        const q = busca.toLowerCase()
        return (
          log.mensagem.toLowerCase().includes(q) ||
          log.acao.toLowerCase().includes(q) ||
          log.usuario.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [initialLogs, filtroTipo, busca])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {FILTROS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFiltroTipo(value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filtroTipo === value
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar por mensagem, ação ou usuário..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="flex-1 min-w-[220px] rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <span className="text-xs text-gray-400">{logs.length} registro{logs.length !== 1 ? 's' : ''}</span>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center shadow-sm">
          <p className="text-gray-400">Nenhum log encontrado.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm divide-y divide-gray-100">
          {logs.map((log) => {
            const cfg = TIPO_CONFIG[log.tipo]
            const data = new Date(log.created_at).toLocaleString('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })
            return (
              <div
                key={log.id}
                className={`flex items-start gap-3 border-l-4 px-4 py-3 ${cfg.row}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-xs text-gray-400 font-mono">[{data}]</span>
                    <span className="text-xs text-gray-500">{log.empresa}</span>
                    <span className="text-xs text-gray-400">({log.usuario})</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-900">{log.mensagem}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
