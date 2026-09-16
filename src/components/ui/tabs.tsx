import Link from 'next/link'
import type { Route } from 'next'

export interface TabItem {
  key: string
  label: string
  href: string
  active: boolean
  /** Marca o 1º item de um cluster visual — só desenha uma divisória fina
   * antes dele, não muda href/ordem/comportamento de clique (chunking pra
   * escanear mais rápido uma lista longa de abas, lei de Hick). */
  newGroup?: boolean
}

export function Tabs({ items, className = '' }: { items: TabItem[]; className?: string }) {
  return (
    <div className={`flex items-center gap-0 overflow-x-auto border-b border-gray-200 ${className}`}>
      {items.map(item => (
        <div key={item.key} className="flex items-center shrink-0">
          {item.newGroup && <span className="mx-1.5 h-4 w-px shrink-0 bg-gray-200" aria-hidden="true" />}
          <Link
            href={item.href as Route}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              item.active
                ? 'border-primary-700 text-primary-700'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {item.label}
          </Link>
        </div>
      ))}
    </div>
  )
}
