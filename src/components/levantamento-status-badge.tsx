import type { LevantamentoStatus } from '@/lib/orcamento'

const CONFIG: Record<LevantamentoStatus, { label: string; className: string }> = {
  nao_iniciado:  { label: 'Não iniciado',  className: 'bg-gray-100 text-gray-600' },
  em_andamento:  { label: 'Em andamento',  className: 'bg-blue-100 text-blue-700' },
  concluido:     { label: 'Concluído',     className: 'bg-emerald-100 text-emerald-700' },
  com_pendencia: { label: 'Com pendência', className: 'bg-amber-100 text-amber-700' },
  bloqueado:     { label: 'Bloqueado',     className: 'bg-red-100 text-red-700' },
}

export function LevantamentoStatusBadge({ status, className }: { status: LevantamentoStatus; className?: string }) {
  const c = CONFIG[status]
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${c.className} ${className ?? ''}`}>
      {c.label}
    </span>
  )
}
