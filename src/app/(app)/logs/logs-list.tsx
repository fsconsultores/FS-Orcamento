'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, ScrollText, Info, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { registrarHistorico } from '@/lib/log'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { Timeline, TimelineItem, type TimelineTone } from '@/components/ui/timeline'

export type LogRow = {
  id: string
  created_at: string
  usuario_email: string | null
  tipo: 'info' | 'sucesso' | 'erro'
  acao: string
  mensagem: string
  detalhes: Record<string, unknown> | null
}

const RESTORABLE: Record<string, { table: string; field: string; label: string }> = {
  limpar_planilha: { table: 'orcamento_estrutura', field: 'itens_apagados', label: 'item(ns) da planilha' },
  limpar_insumos_avulsos: { table: 'orcamento_insumos', field: 'insumos_apagados', label: 'insumo(s) avulso(s)' },
}

function itemLabel(item: Record<string, unknown>): string {
  if (typeof item.numero === 'string' && item.numero) {
    return `${item.numero} — ${item.descricao ?? ''}`
  }
  return `${item.codigo ?? ''} — ${item.descricao ?? ''}`
}

const TIPO_CONFIG: Record<LogRow['tipo'], { label: string; variant: BadgeVariant; tone: TimelineTone; icon: typeof Info }> = {
  info: { label: 'Info', variant: 'neutral', tone: 'neutral', icon: Info },
  sucesso: { label: 'Sucesso', variant: 'success', tone: 'success', icon: CheckCircle2 },
  erro: { label: 'Erro', variant: 'error', tone: 'error', icon: AlertCircle },
}

const FILTROS = [
  { value: '' as const, label: 'Todos' },
  { value: 'sucesso' as const, label: 'Sucesso' },
  { value: 'info' as const, label: 'Info' },
  { value: 'erro' as const, label: 'Erro' },
]

export function LogsList({ initialLogs, fetchError }: { initialLogs: LogRow[]; fetchError?: string }) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [filtroTipo, setFiltroTipo] = useState<'' | LogRow['tipo']>('')
  const [busca, setBusca] = useState('')
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null)
  const [confirmarRestaurar, setConfirmarRestaurar] = useState<LogRow | null>(null)

  function atualizar() {
    startTransition(() => router.refresh())
  }

  function toggleExpandido(id: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleRestaurar(log: LogRow) {
    const cfg = RESTORABLE[log.acao]
    if (!cfg) return
    const itens = (log.detalhes?.[cfg.field] as Record<string, unknown>[]) ?? []
    if (itens.length === 0) return

    setConfirmarRestaurar(null)
    setRestaurandoId(log.id)
    try {
      const sb = createClient() as any
      const ordenados = [...itens].sort(
        (a, b) => ((a.nivel as number) ?? 0) - ((b.nivel as number) ?? 0)
      )
      const { error } = await sb.from(cfg.table).insert(ordenados)
      if (error) {
        toast.show(`Não foi possível restaurar: ${error.message}`, 'error')
        return
      }
      await registrarHistorico(sb, {
        tipo: 'info',
        acao: `restaurar_${log.acao}`,
        mensagem: `${itens.length} ${cfg.label} restaurado(s) a partir do log de ${new Date(log.created_at).toLocaleString('pt-BR')}`,
        detalhes: { log_original_id: log.id },
      }).catch(console.error)
      toast.show('Restaurado com sucesso.')
      atualizar()
    } finally {
      setRestaurandoId(null)
    }
  }

  const logs = useMemo(() => {
    return initialLogs.filter((log) => {
      if (filtroTipo && log.tipo !== filtroTipo) return false
      if (busca.trim()) {
        const q = busca.toLowerCase()
        return (
          log.mensagem.toLowerCase().includes(q) ||
          log.acao.toLowerCase().includes(q) ||
          (log.usuario_email ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [initialLogs, filtroTipo, busca])

  if (fetchError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm font-medium text-red-700">Não foi possível carregar os logs</p>
        <p className="mt-1 font-mono text-xs text-red-500">{fetchError}</p>
        <Button variant="danger" size="sm" className="mt-3" onClick={atualizar} loading={isPending}>
          Tentar novamente
        </Button>
      </div>
    )
  }

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
                  ? 'bg-primary-700 border-primary-700 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-primary-400'
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
          className="flex-1 min-w-[220px] rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
        />
        <span className="text-xs text-gray-400">{logs.length} registro{logs.length !== 1 ? 's' : ''}</span>
        <Button variant="outline" size="sm" onClick={atualizar} loading={isPending} icon={<RefreshCw size={13} />}>
          Atualizar
        </Button>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <EmptyState
            icon={<ScrollText size={20} />}
            title="Nenhum log encontrado"
            description="Ajuste os filtros ou a busca para ver outros eventos."
          />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <Timeline>
            {logs.map((log, i) => {
              const cfg = TIPO_CONFIG[log.tipo]
              const Icon = cfg.icon
              const data = new Date(log.created_at).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })
              const restoreCfg = RESTORABLE[log.acao]
              const itensApagados = restoreCfg
                ? ((log.detalhes?.[restoreCfg.field] as Record<string, unknown>[]) ?? [])
                : []
              const expandido = expandidos.has(log.id)
              return (
                <TimelineItem key={log.id} icon={<Icon size={14} />} tone={cfg.tone} isLast={i === logs.length - 1}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span suppressHydrationWarning className="text-xs text-gray-400 font-mono">[{data}]</span>
                    <span className="text-xs text-gray-400">({log.usuario_email ?? 'sistema'})</span>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    <span className="text-xs text-gray-400 font-mono">{log.acao}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-900">{log.mensagem}</p>

                  {itensApagados.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => toggleExpandido(log.id)}
                        className="text-xs font-medium text-primary-700 hover:underline"
                      >
                        {expandido ? 'Ocultar itens apagados' : `Ver ${itensApagados.length} item(ns) apagado(s)`}
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="!h-6 !px-2 !text-xs !border-emerald-300 !bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100"
                        onClick={() => setConfirmarRestaurar(log)}
                        loading={restaurandoId === log.id}
                      >
                        Restaurar
                      </Button>
                    </div>
                  )}

                  {expandido && itensApagados.length > 0 && (
                    <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
                      {itensApagados.map((item, ii) => (
                        <li key={(item.id as string) ?? ii} className="truncate py-0.5">
                          {itemLabel(item)}
                        </li>
                      ))}
                    </ul>
                  )}
                </TimelineItem>
              )
            })}
          </Timeline>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmarRestaurar}
        onClose={() => setConfirmarRestaurar(null)}
        onConfirm={() => confirmarRestaurar && handleRestaurar(confirmarRestaurar)}
        title="Restaurar itens apagados"
        description={
          confirmarRestaurar
            ? `Restaurar ${((confirmarRestaurar.detalhes?.[RESTORABLE[confirmarRestaurar.acao]?.field ?? ''] as unknown[]) ?? []).length} ${RESTORABLE[confirmarRestaurar.acao]?.label ?? 'item(ns)'}?`
            : ''
        }
        confirmLabel="Restaurar"
      />
    </div>
  )
}
