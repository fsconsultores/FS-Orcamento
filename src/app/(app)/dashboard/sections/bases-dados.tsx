import Link from 'next/link'
import { Database } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { baseLabelFromOrgao } from '@/components/base-labels'
import { formatRelative } from '@/lib/dashboard/format-relative'
import type { BaseResumo } from '@/lib/dashboard/queries'

const ORDEM_ORGAO = ['SINAPI', 'DNIT', 'DER', 'SUDECAP']

export function BasesDados({ bases }: { bases: BaseResumo[] }) {
  const ordenadas = [...bases].sort((a, b) => {
    const rankA = a.tipo_base === 'propria' ? ORDEM_ORGAO.length : ORDEM_ORGAO.indexOf(a.orgao)
    const rankB = b.tipo_base === 'propria' ? ORDEM_ORGAO.length : ORDEM_ORGAO.indexOf(b.orgao)
    return (rankA === -1 ? 99 : rankA) - (rankB === -1 ? 99 : rankB)
  })

  if (ordenadas.length === 0) {
    return <EmptyState icon={<Database size={18} />} title="Nenhuma base cadastrada ainda." />
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-gray-100">
        {ordenadas.map((b) => (
          <li key={b.base_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="font-medium text-gray-700">
              {b.tipo_base === 'propria' ? 'Base Própria' : baseLabelFromOrgao(b.orgao)}
            </span>
            <span className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-gray-500">
              <span>{b.total_insumos.toLocaleString('pt-BR')} insumos</span>
              <span>{b.total_composicoes.toLocaleString('pt-BR')} composições</span>
              <span className="text-gray-400">{b.ultima_importacao ? formatRelative(b.ultima_importacao) : 'nunca importado'}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/bases"
        className="inline-flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        Gerenciar Bases
      </Link>
    </div>
  )
}
