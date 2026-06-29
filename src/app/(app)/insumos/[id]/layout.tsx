'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'

const TABS = [
  { suffix: 'editar',    label: 'Dados' },
  { suffix: 'historico', label: 'Histórico de Preços' },
]

export default function InsumoLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>()
  const pathname = usePathname()

  return (
    <div className="space-y-0">
      <Link href="/insumos" className="text-sm text-blue-600 hover:underline">
        ← Insumos
      </Link>
      <div className="mt-4 flex gap-1 border-b border-gray-200">
        {TABS.map(tab => {
          const href = `/insumos/${id}/${tab.suffix}` as any
          const active = pathname.startsWith(href)
          return (
            <Link
              key={tab.suffix}
              href={href}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  )
}
