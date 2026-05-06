'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  orcamentoId: string
}

const TABS = [
  { suffix: '', label: 'Visão Geral' },
  { suffix: 'insumos', label: 'Insumos' },
  { suffix: 'composicoes', label: 'Composições' },
  { suffix: 'importar', label: 'Importar Excel' },
]

export function OrcamentoSubNav({ orcamentoId }: Props) {
  const pathname = usePathname()
  const base = `/orcamentos/${orcamentoId}`

  return (
    <div className="flex gap-0 border-b border-gray-200 mb-6 -mt-2">
      {TABS.map(({ suffix, label }) => {
        const href = suffix ? `${base}/${suffix}` : base
        const active = suffix
          ? pathname.startsWith(`${base}/${suffix}`)
          : pathname === base

        return (
          <Link
            key={href}
            href={href as any}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
