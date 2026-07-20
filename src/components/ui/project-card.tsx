import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Badge, type BadgeVariant } from './badge'
import { fmt } from '@/lib/curva-abc'

export function ProjectCard({
  id,
  nome,
  cliente,
  valor,
  dataRelativa,
  statusLabel,
  statusVariant,
}: {
  id: string
  nome: string
  cliente: string | null
  valor: number
  dataRelativa: string
  statusLabel: string
  statusVariant: BadgeVariant
}) {
  return (
    <Link
      href={`/orcamentos/${id}` as any}
      className="group flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{nome}</p>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>
      <p className="truncate text-xs text-gray-500">{cliente || 'Sem cliente informado'}</p>
      <p className="text-lg font-bold tabular-nums text-gray-900">{fmt(valor)}</p>
      <div className="mt-1 flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
        <span className="text-xs text-gray-400">Atualizado {dataRelativa}</span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 group-hover:underline">
          Abrir <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  )
}
